import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Product } from "../models/product.model.js";
import { Category } from "../models/category.model.js";

// Get all products with pagination
const getAllProducts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  // Build filter
  const filter = { isActive: true };
  
  if (req.query.category) {
    filter.category = req.query.category;
  }
  
  const products = await Product.find(filter)
    .populate("category", "name")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  
  const totalProducts = await Product.countDocuments(filter);
  const totalPages = Math.ceil(totalProducts / limit);
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {
        products,
        pagination: {
          currentPage: page,
          totalPages,
          totalProducts,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      },
      "Products retrieved successfully"
    ));
});

// Create a new product
const createProduct = asyncHandler(async (req, res) => {
  const { 
    name, 
    description, 
    sku, 
    barcode, 
    category, 
    purchasePrice, 
    sellingPrice, 
    discountPrice, 
    quantity, 
    minQuantity,
    unit,
    unitValue,
    expiryDate,
    manufacturingDate
  } = req.body;
  
  // Validate required fields
  if (!name || !sku || !category || !purchasePrice || !sellingPrice || !unit) {
    throw new ApiError(400, "Please provide all required fields");
  }
  
  // Check if product with same SKU already exists
  const existingProduct = await Product.findOne({ sku });
  if (existingProduct) {
    throw new ApiError(409, "Product with this SKU already exists");
  }
  
  // Check if barcode is unique if provided
  if (barcode) {
    const productWithBarcode = await Product.findOne({ barcode });
    if (productWithBarcode) {
      throw new ApiError(409, "Product with this barcode already exists");
    }
  }
  
  // Verify category exists
  const categoryExists = await Category.findById(category);
  if (!categoryExists) {
    throw new ApiError(404, "Category not found");
  }
  
  // Create product
  const product = await Product.create({
    name,
    description,
    sku,
    barcode,
    category,
    purchasePrice,
    sellingPrice,
    discountPrice: discountPrice || 0,
    quantity: quantity || 0,
    minQuantity: minQuantity || 10,
    unit,
    unitValue: unitValue || 1,
    expiryDate,
    manufacturingDate,
    createdBy: req.user._id
  });
  
  const populatedProduct = await Product.findById(product._id).populate("category", "name");
  
  return res
    .status(201)
    .json(new apiResponse(
      201,
      populatedProduct,
      "Product created successfully"
    ));
});

// Get product by ID
const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const product = await Product.findById(id).populate("category", "name");
  
  if (!product) {
    throw new ApiError(404, "Product not found");
  }
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      product,
      "Product retrieved successfully"
    ));
});

// Get products by category
const getProductsByCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  
  // Verify category exists
  const categoryExists = await Category.findById(categoryId);
  if (!categoryExists) {
    throw new ApiError(404, "Category not found");
  }
  
  const products = await Product.find({ 
    category: categoryId,
    isActive: true 
  }).populate("category", "name");
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      products,
      "Products retrieved successfully"
    ));
});

// Update product
const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const product = await Product.findById(id);
  
  if (!product) {
    throw new ApiError(404, "Product not found");
  }
  
  // Check if SKU is being updated and is unique
  if (updateData.sku && updateData.sku !== product.sku) {
    const existingProduct = await Product.findOne({ sku: updateData.sku });
    if (existingProduct) {
      throw new ApiError(409, "Product with this SKU already exists");
    }
  }
  
  // Check if barcode is being updated and is unique
  if (updateData.barcode && updateData.barcode !== product.barcode) {
    const productWithBarcode = await Product.findOne({ barcode: updateData.barcode });
    if (productWithBarcode) {
      throw new ApiError(409, "Product with this barcode already exists");
    }
  }
  
  // Check if category exists if it's being updated
  if (updateData.category) {
    const categoryExists = await Category.findById(updateData.category);
    if (!categoryExists) {
      throw new ApiError(404, "Category not found");
    }
  }
  
  // Update product
  Object.keys(updateData).forEach(key => {
    product[key] = updateData[key];
  });
  
  await product.save();
  
  const updatedProduct = await Product.findById(id).populate("category", "name");
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      updatedProduct,
      "Product updated successfully"
    ));
});

// Delete product (soft delete)
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const product = await Product.findById(id);
  
  if (!product) {
    throw new ApiError(404, "Product not found");
  }
  
  // Soft delete
  product.isActive = false;
  await product.save();
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {},
      "Product deleted successfully"
    ));
});

// Get low stock products
const getLowStockProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({
    isActive: true,
    $expr: { $lte: ["$quantity", "$minQuantity"] }
  }).populate("category", "name");
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      products,
      "Low stock products retrieved successfully"
    ));
});

// Search products
const searchProducts = asyncHandler(async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    throw new ApiError(400, "Search query is required");
  }
  
  const products = await Product.find({
    isActive: true,
    $or: [
      { name: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
      { sku: { $regex: query, $options: "i" } },
      { barcode: { $regex: query, $options: "i" } }
    ]
  }).populate("category", "name");
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      products,
      "Products search results"
    ));
});

export {
  getAllProducts,
  createProduct,
  getProductById,
  getProductsByCategory,
  updateProduct,
  deleteProduct,
  getLowStockProducts,
  searchProducts
};
