import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Supplier } from "../models/supplier.model.js";

// Get all suppliers with pagination
const getAllSuppliers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  // Build filter
  const filter = { isActive: true };
  
  // Search by name or contact person if provided
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { contactPerson: { $regex: req.query.search, $options: "i" } }
    ];
  }
  
  const suppliers = await Supplier.find(filter)
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit);
  
  const totalSuppliers = await Supplier.countDocuments(filter);
  const totalPages = Math.ceil(totalSuppliers / limit);
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {
        suppliers,
        pagination: {
          currentPage: page,
          totalPages,
          totalSuppliers,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      },
      "Suppliers retrieved successfully"
    ));
});

// Create a new supplier
const createSupplier = asyncHandler(async (req, res) => {
  const { 
    name, 
    contactPerson, 
    email, 
    phone, 
    address, 
    paymentTerms, 
    notes 
  } = req.body;
  
  if (!name) {
    throw new ApiError(400, "Supplier name is required");
  }
  
  // Check if supplier with same name already exists
  const existingSupplier = await Supplier.findOne({ name, isActive: true });
  if (existingSupplier) {
    throw new ApiError(409, "Supplier with this name already exists");
  }
  
  // Create supplier
  const supplier = await Supplier.create({
    name,
    contactPerson,
    email,
    phone,
    address,
    paymentTerms,
    notes,
    createdBy: req.user._id
  });
  
  return res
    .status(201)
    .json(new apiResponse(
      201,
      supplier,
      "Supplier created successfully"
    ));
});

// Get supplier by ID
const getSupplierById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const supplier = await Supplier.findById(id);
  
  if (!supplier || !supplier.isActive) {
    throw new ApiError(404, "Supplier not found");
  }
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      supplier,
      "Supplier retrieved successfully"
    ));
});

// Update supplier
const updateSupplier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const supplier = await Supplier.findById(id);
  
  if (!supplier || !supplier.isActive) {
    throw new ApiError(404, "Supplier not found");
  }
  
  // Check if name is being updated and is unique
  if (updateData.name && updateData.name !== supplier.name) {
    const existingSupplier = await Supplier.findOne({ 
      name: updateData.name,
      isActive: true,
      _id: { $ne: id }
    });
    
    if (existingSupplier) {
      throw new ApiError(409, "Supplier with this name already exists");
    }
  }
  
  // Update fields
  Object.keys(updateData).forEach(key => {
    supplier[key] = updateData[key];
  });
  
  await supplier.save();
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      supplier,
      "Supplier updated successfully"
    ));
});

// Delete supplier (soft delete)
const deleteSupplier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const supplier = await Supplier.findById(id);
  
  if (!supplier || !supplier.isActive) {
    throw new ApiError(404, "Supplier not found");
  }
  
  // Soft delete
  supplier.isActive = false;
  await supplier.save();
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {},
      "Supplier deleted successfully"
    ));
});

export {
  getAllSuppliers,
  createSupplier,
  getSupplierById,
  updateSupplier,
  deleteSupplier
};
