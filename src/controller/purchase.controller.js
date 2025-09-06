import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Purchase } from "../models/purchase.model.js";
import { Product } from "../models/product.model.js";
import { Supplier } from "../models/supplier.model.js";
import mongoose from "mongoose";

// Generate unique invoice number
const generateInvoiceNumber = async () => {
  const prefix = "PO-";
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  
  // Find the latest purchase to determine the next number
  const latestPurchase = await Purchase.findOne({}, {}, { sort: { 'createdAt': -1 } });
  
  let nextNumber = 1;
  if (latestPurchase && latestPurchase.invoiceNumber) {
    const parts = latestPurchase.invoiceNumber.split('-');
    if (parts.length >= 3) {
      const lastNumber = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }
  }
  
  return `${prefix}${date}-${nextNumber.toString().padStart(4, '0')}`;
};

// Get all purchases with pagination
const getAllPurchases = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  // Build filter
  const filter = {};
  
  // Filter by date range
  if (req.query.startDate && req.query.endDate) {
    filter.purchaseDate = {
      $gte: new Date(req.query.startDate),
      $lte: new Date(req.query.endDate)
    };
  }
  
  // Filter by supplier
  if (req.query.supplier) {
    filter.supplier = req.query.supplier;
  }
  
  // Filter by status
  if (req.query.status) {
    filter.status = req.query.status;
  }
  
  // Filter by payment status
  if (req.query.paymentStatus) {
    filter.paymentStatus = req.query.paymentStatus;
  }
  
  const purchases = await Purchase.find(filter)
    .populate("supplier", "name contactPerson")
    .populate("items.product", "name sku")
    .sort({ purchaseDate: -1 })
    .skip(skip)
    .limit(limit);
  
  const totalPurchases = await Purchase.countDocuments(filter);
  const totalPages = Math.ceil(totalPurchases / limit);
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {
        purchases,
        pagination: {
          currentPage: page,
          totalPages,
          totalPurchases,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      },
      "Purchases retrieved successfully"
    ));
});

// Create a new purchase
const createPurchase = asyncHandler(async (req, res) => {
  const { 
    supplier,
    purchaseDate,
    expectedDeliveryDate,
    items,
    taxRate,
    discountAmount,
    shippingCost,
    notes,
    paymentStatus,
    paymentMethod,
    paidAmount
  } = req.body;
  
  // Validation
  if (!supplier || !items || !items.length) {
    throw new ApiError(400, "Supplier and at least one item are required");
  }
  
  // Check if supplier exists
  const supplierExists = await Supplier.findById(supplier);
  if (!supplierExists || !supplierExists.isActive) {
    throw new ApiError(404, "Supplier not found");
  }
  
  // Validate items and calculate totals
  let subTotal = 0;
  let validatedItems = [];
  
  for (const item of items) {
    if (!item.product || !item.quantity || !item.unitPrice) {
      throw new ApiError(400, "Each item must have product, quantity, and unit price");
    }
    
    // Check if product exists
    const product = await Product.findById(item.product);
    if (!product || !product.isActive) {
      throw new ApiError(404, `Product with ID ${item.product} not found`);
    }
    
    const itemTotal = item.quantity * item.unitPrice;
    subTotal += itemTotal;
    
    validatedItems.push({
      product: item.product,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: itemTotal
    });
  }
  
  // Calculate tax amount
  const taxAmount = subTotal * (taxRate || 0) / 100;
  
  // Calculate total amount
  const totalAmount = subTotal + taxAmount + (shippingCost || 0) - (discountAmount || 0);
  
  // Calculate due amount
  const dueAmount = totalAmount - (paidAmount || 0);
  
  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber();
  
  // Create purchase
  const purchase = await Purchase.create({
    invoiceNumber,
    supplier,
    purchaseDate: purchaseDate || new Date(),
    expectedDeliveryDate,
    items: validatedItems,
    subTotal,
    taxRate: taxRate || 0,
    taxAmount,
    discountAmount: discountAmount || 0,
    shippingCost: shippingCost || 0,
    totalAmount,
    paymentStatus: paymentStatus || "pending",
    paymentMethod: paymentMethod || "cash",
    paidAmount: paidAmount || 0,
    dueAmount,
    notes,
    status: "pending",
    createdBy: req.user._id
  });
  
  return res
    .status(201)
    .json(new apiResponse(
      201,
      purchase,
      "Purchase order created successfully"
    ));
});

// Get purchase by ID
const getPurchaseById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const purchase = await Purchase.findById(id)
    .populate("supplier", "name contactPerson email phone address")
    .populate("items.product", "name sku unit unitValue")
    .populate("createdBy", "fullName");
  
  if (!purchase) {
    throw new ApiError(404, "Purchase not found");
  }
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      purchase,
      "Purchase retrieved successfully"
    ));
});

// Update purchase
const updatePurchase = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  // Find purchase
  const purchase = await Purchase.findById(id);
  
  if (!purchase) {
    throw new ApiError(404, "Purchase not found");
  }
  
  // Check if purchase status is cancelled
  if (purchase.status === "cancelled") {
    throw new ApiError(400, "Cancelled purchase cannot be updated");
  }
  
  // Check if we need to recalculate financials
  let needsRecalculation = false;
  
  if (updateData.items || 
      updateData.taxRate !== undefined || 
      updateData.discountAmount !== undefined || 
      updateData.shippingCost !== undefined ||
      updateData.paidAmount !== undefined) {
    needsRecalculation = true;
  }
  
  // If delivery status is updated to "delivered", update the inventory
  if (updateData.status === "delivered" && purchase.status !== "delivered") {
    // Start a MongoDB transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Update product quantities
      for (const item of purchase.items) {
        const product = await Product.findById(item.product);
        
        if (!product) {
          throw new ApiError(404, `Product with ID ${item.product} not found`);
        }
        
        product.quantity += item.quantity;
        await product.save({ session });
      }
      
      // Set actual delivery date if not provided
      if (!updateData.actualDeliveryDate) {
        updateData.actualDeliveryDate = new Date();
      }
      
      // Commit transaction
      await session.commitTransaction();
    } catch (error) {
      // If any error occurs, abort transaction
      await session.abortTransaction();
      throw error;
    } finally {
      // End session
      session.endSession();
    }
  }
  
  // Recalculate financials if needed
  if (needsRecalculation) {
    // If items are updated
    if (updateData.items) {
      let subTotal = 0;
      let validatedItems = [];
      
      for (const item of updateData.items) {
        if (!item.product || !item.quantity || !item.unitPrice) {
          throw new ApiError(400, "Each item must have product, quantity, and unit price");
        }
        
        // Check if product exists
        const product = await Product.findById(item.product);
        if (!product || !product.isActive) {
          throw new ApiError(404, `Product with ID ${item.product} not found`);
        }
        
        const itemTotal = item.quantity * item.unitPrice;
        subTotal += itemTotal;
        
        validatedItems.push({
          product: item.product,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: itemTotal
        });
      }
      
      updateData.items = validatedItems;
      updateData.subTotal = subTotal;
    } else {
      // Use existing values
      updateData.subTotal = purchase.subTotal;
      updateData.items = purchase.items;
    }
    
    // Recalculate tax amount
    const taxRate = updateData.taxRate !== undefined ? updateData.taxRate : purchase.taxRate;
    updateData.taxAmount = updateData.subTotal * taxRate / 100;
    
    // Get other values (use new values if provided, otherwise use existing)
    const discountAmount = updateData.discountAmount !== undefined ? updateData.discountAmount : purchase.discountAmount;
    const shippingCost = updateData.shippingCost !== undefined ? updateData.shippingCost : purchase.shippingCost;
    
    // Recalculate total amount
    updateData.totalAmount = updateData.subTotal + updateData.taxAmount + shippingCost - discountAmount;
    
    // Recalculate due amount
    const paidAmount = updateData.paidAmount !== undefined ? updateData.paidAmount : purchase.paidAmount;
    updateData.dueAmount = updateData.totalAmount - paidAmount;
    
    // Auto-update payment status based on paid and due amounts
    if (updateData.dueAmount <= 0) {
      updateData.paymentStatus = "paid";
    } else if (paidAmount > 0) {
      updateData.paymentStatus = "partial";
    } else {
      updateData.paymentStatus = "pending";
    }
  }
  
  // Update purchase
  const updatedPurchase = await Purchase.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  );
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      updatedPurchase,
      "Purchase updated successfully"
    ));
});

// Cancel purchase
const cancelPurchase = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const purchase = await Purchase.findById(id);
  
  if (!purchase) {
    throw new ApiError(404, "Purchase not found");
  }
  
  // Only pending purchases can be cancelled
  if (purchase.status !== "pending") {
    throw new ApiError(400, "Only pending purchases can be cancelled");
  }
  
  // Update status
  purchase.status = "cancelled";
  purchase.paymentStatus = "cancelled";
  
  await purchase.save();
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      purchase,
      "Purchase cancelled successfully"
    ));
});

// Get purchase statistics
const getPurchaseStats = asyncHandler(async (req, res) => {
  // Get date range filters
  const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
  const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
  
  // Set end date to end of day
  endDate.setHours(23, 59, 59, 999);
  
  // Get total purchases
  const totalPurchases = await Purchase.countDocuments({ 
    purchaseDate: { $gte: startDate, $lte: endDate },
    status: { $ne: "cancelled" }
  });
  
  // Get total purchase amount
  const purchaseAmountResult = await Purchase.aggregate([
    { 
      $match: { 
        purchaseDate: { $gte: startDate, $lte: endDate },
        status: { $ne: "cancelled" }
      } 
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$totalAmount" },
        paidAmount: { $sum: "$paidAmount" },
        dueAmount: { $sum: "$dueAmount" }
      }
    }
  ]);
  
  const purchaseAmount = purchaseAmountResult.length > 0 ? purchaseAmountResult[0] : { totalAmount: 0, paidAmount: 0, dueAmount: 0 };
  
  // Get purchase by status
  const purchaseByStatus = await Purchase.aggregate([
    { 
      $match: { 
        purchaseDate: { $gte: startDate, $lte: endDate }
      } 
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        amount: { $sum: "$totalAmount" }
      }
    }
  ]);
  
  // Get purchase by payment status
  const purchaseByPaymentStatus = await Purchase.aggregate([
    { 
      $match: { 
        purchaseDate: { $gte: startDate, $lte: endDate },
        status: { $ne: "cancelled" }
      } 
    },
    {
      $group: {
        _id: "$paymentStatus",
        count: { $sum: 1 },
        amount: { $sum: "$totalAmount" }
      }
    }
  ]);
  
  // Get purchase by supplier
  const purchaseBySupplier = await Purchase.aggregate([
    { 
      $match: { 
        purchaseDate: { $gte: startDate, $lte: endDate },
        status: { $ne: "cancelled" }
      } 
    },
    {
      $group: {
        _id: "$supplier",
        count: { $sum: 1 },
        amount: { $sum: "$totalAmount" }
      }
    },
    {
      $sort: { amount: -1 }
    },
    {
      $limit: 5
    },
    {
      $lookup: {
        from: "suppliers",
        localField: "_id",
        foreignField: "_id",
        as: "supplier"
      }
    },
    {
      $project: {
        _id: 1,
        count: 1,
        amount: 1,
        supplierName: { $arrayElemAt: ["$supplier.name", 0] }
      }
    }
  ]);
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {
        totalPurchases,
        purchaseAmount,
        purchaseByStatus,
        purchaseByPaymentStatus,
        purchaseBySupplier,
        dateRange: {
          startDate,
          endDate
        }
      },
      "Purchase statistics retrieved successfully"
    ));
});

export {
  getAllPurchases,
  createPurchase,
  getPurchaseById,
  updatePurchase,
  cancelPurchase,
  getPurchaseStats
};
