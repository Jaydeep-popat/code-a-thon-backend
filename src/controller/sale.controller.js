import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Sale } from "../models/sale.model.js";
import { Product } from "../models/product.model.js";
import mongoose from "mongoose";

// Generate unique invoice number
const generateInvoiceNumber = async () => {
  const prefix = "INV-";
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  
  // Find the latest sale to determine the next number
  const latestSale = await Sale.findOne({}, {}, { sort: { 'createdAt': -1 } });
  
  let nextNumber = 1;
  if (latestSale && latestSale.invoiceNumber) {
    const parts = latestSale.invoiceNumber.split('-');
    if (parts.length >= 3) {
      const lastNumber = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }
  }
  
  return `${prefix}${date}-${nextNumber.toString().padStart(4, '0')}`;
};

// Get all sales with pagination
const getAllSales = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  // Build filter
  const filter = {};
  
  // Filter by date range
  if (req.query.startDate && req.query.endDate) {
    filter.saleDate = {
      $gte: new Date(req.query.startDate),
      $lte: new Date(req.query.endDate)
    };
  }
  
  // Filter by payment status
  if (req.query.paymentStatus) {
    filter.paymentStatus = req.query.paymentStatus;
  }
  
  // Filter by payment method
  if (req.query.paymentMethod) {
    filter.paymentMethod = req.query.paymentMethod;
  }
  
  const sales = await Sale.find(filter)
    .populate("items.product", "name sku")
    .populate("createdBy", "fullName")
    .sort({ saleDate: -1 })
    .skip(skip)
    .limit(limit);
  
  const totalSales = await Sale.countDocuments(filter);
  const totalPages = Math.ceil(totalSales / limit);
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {
        sales,
        pagination: {
          currentPage: page,
          totalPages,
          totalSales,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      },
      "Sales retrieved successfully"
    ));
});

// Create a new sale
const createSale = asyncHandler(async (req, res) => {
  const { 
    customer,
    items,
    taxRate,
    discountAmount,
    paymentStatus,
    paymentMethod,
    paidAmount,
    notes
  } = req.body;
  
  // Validation
  if (!items || !items.length) {
    throw new ApiError(400, "At least one item is required");
  }
  
  if (!customer || !customer.name) {
    throw new ApiError(400, "Customer name is required");
  }
  
  // Start MongoDB transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Validate items and calculate totals
    let subTotal = 0;
    let validatedItems = [];
    
    for (const item of items) {
      if (!item.product || !item.quantity || !item.unitPrice) {
        throw new ApiError(400, "Each item must have product, quantity, and unit price");
      }
      
      // Check if product exists and has enough stock
      const product = await Product.findById(item.product);
      if (!product || !product.isActive) {
        throw new ApiError(404, `Product with ID ${item.product} not found`);
      }
      
      if (product.quantity < item.quantity) {
        throw new ApiError(400, `Not enough stock for product "${product.name}". Available: ${product.quantity}`);
      }
      
      const itemTotal = item.quantity * item.unitPrice;
      subTotal += itemTotal;
      
      validatedItems.push({
        product: item.product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: itemTotal
      });
      
      // Reduce product quantity
      product.quantity -= item.quantity;
      await product.save({ session });
    }
    
    // Calculate tax amount
    const finalTaxRate = taxRate || 0;
    const taxAmount = subTotal * finalTaxRate / 100;
    
    // Calculate total amount
    const finalDiscountAmount = discountAmount || 0;
    const totalAmount = subTotal + taxAmount - finalDiscountAmount;
    
    // Calculate due amount and change
    const finalPaidAmount = paidAmount || 0;
    let dueAmount = 0;
    let changeAmount = 0;
    
    if (finalPaidAmount >= totalAmount) {
      dueAmount = 0;
      changeAmount = finalPaidAmount - totalAmount;
    } else {
      dueAmount = totalAmount - finalPaidAmount;
      changeAmount = 0;
    }
    
    // Determine payment status
    let finalPaymentStatus = paymentStatus || "pending";
    if (dueAmount <= 0) {
      finalPaymentStatus = "paid";
    } else if (finalPaidAmount > 0) {
      finalPaymentStatus = "partial";
    }
    
    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber();
    
    // Create sale
    const sale = await Sale.create([{
      invoiceNumber,
      customer,
      saleDate: new Date(),
      items: validatedItems,
      subTotal,
      taxRate: finalTaxRate,
      taxAmount,
      discountAmount: finalDiscountAmount,
      totalAmount,
      paymentStatus: finalPaymentStatus,
      paymentMethod: paymentMethod || "cash",
      paidAmount: finalPaidAmount,
      changeAmount,
      dueAmount,
      notes,
      createdBy: req.user._id
    }], { session });
    
    // Commit transaction
    await session.commitTransaction();
    
    // Fetch the populated sale for the response
    const populatedSale = await Sale.findById(sale[0]._id)
      .populate("items.product", "name sku")
      .populate("createdBy", "fullName");
    
    return res
      .status(201)
      .json(new apiResponse(
        201,
        populatedSale,
        "Sale created successfully"
      ));
  } catch (error) {
    // If any error occurs, abort transaction
    await session.abortTransaction();
    throw error;
  } finally {
    // End session
    session.endSession();
  }
});

// Get sale by ID
const getSaleById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const sale = await Sale.findById(id)
    .populate("items.product", "name sku unit unitValue")
    .populate("createdBy", "fullName");
  
  if (!sale) {
    throw new ApiError(404, "Sale not found");
  }
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      sale,
      "Sale retrieved successfully"
    ));
});

// Update sale
const updateSale = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  // Find sale
  const sale = await Sale.findById(id);
  
  if (!sale) {
    throw new ApiError(404, "Sale not found");
  }
  
  // Check if sale payment status is cancelled
  if (sale.paymentStatus === "cancelled") {
    throw new ApiError(400, "Cancelled sale cannot be updated");
  }
  
  // Update only certain fields
  const allowedFields = ["paymentStatus", "paymentMethod", "paidAmount", "notes", "customer"];
  
  // Filter updateData to only include allowed fields
  const filteredUpdateData = {};
  Object.keys(updateData).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdateData[key] = updateData[key];
    }
  });
  
  // If paidAmount is updated, recalculate dueAmount and changeAmount
  if (filteredUpdateData.paidAmount !== undefined) {
    if (filteredUpdateData.paidAmount >= sale.totalAmount) {
      filteredUpdateData.dueAmount = 0;
      filteredUpdateData.changeAmount = filteredUpdateData.paidAmount - sale.totalAmount;
      filteredUpdateData.paymentStatus = "paid";
    } else {
      filteredUpdateData.dueAmount = sale.totalAmount - filteredUpdateData.paidAmount;
      filteredUpdateData.changeAmount = 0;
      filteredUpdateData.paymentStatus = filteredUpdateData.paidAmount > 0 ? "partial" : "pending";
    }
  }
  
  // Update sale
  const updatedSale = await Sale.findByIdAndUpdate(
    id,
    { $set: filteredUpdateData },
    { new: true, runValidators: true }
  )
  .populate("items.product", "name sku")
  .populate("createdBy", "fullName");
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      updatedSale,
      "Sale updated successfully"
    ));
});

// Cancel sale
const cancelSale = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Find sale
  const sale = await Sale.findById(id);
  
  if (!sale) {
    throw new ApiError(404, "Sale not found");
  }
  
  // Check if sale is already cancelled
  if (sale.paymentStatus === "cancelled") {
    throw new ApiError(400, "Sale is already cancelled");
  }
  
  // Start MongoDB transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Restore product quantities
    for (const item of sale.items) {
      const product = await Product.findById(item.product);
      
      if (product) {
        product.quantity += item.quantity;
        await product.save({ session });
      }
    }
    
    // Update sale status
    sale.paymentStatus = "cancelled";
    await sale.save({ session });
    
    // Commit transaction
    await session.commitTransaction();
    
    return res
      .status(200)
      .json(new apiResponse(
        200,
        sale,
        "Sale cancelled successfully"
      ));
  } catch (error) {
    // If any error occurs, abort transaction
    await session.abortTransaction();
    throw error;
  } finally {
    // End session
    session.endSession();
  }
});

// Get sale statistics
const getSaleStats = asyncHandler(async (req, res) => {
  // Get date range filters
  const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
  const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
  
  // Set end date to end of day
  endDate.setHours(23, 59, 59, 999);
  
  // Get total sales
  const totalSales = await Sale.countDocuments({ 
    saleDate: { $gte: startDate, $lte: endDate },
    paymentStatus: { $ne: "cancelled" }
  });
  
  // Get total sale amount
  const saleAmountResult = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate },
        paymentStatus: { $ne: "cancelled" }
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
  
  const saleAmount = saleAmountResult.length > 0 ? saleAmountResult[0] : { totalAmount: 0, paidAmount: 0, dueAmount: 0 };
  
  // Get sale by payment status
  const saleByPaymentStatus = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate }
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
  
  // Get sale by payment method
  const saleByPaymentMethod = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate },
        paymentStatus: { $ne: "cancelled" }
      } 
    },
    {
      $group: {
        _id: "$paymentMethod",
        count: { $sum: 1 },
        amount: { $sum: "$totalAmount" }
      }
    }
  ]);
  
  // Get top selling products
  const topSellingProducts = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate },
        paymentStatus: { $ne: "cancelled" }
      } 
    },
    {
      $unwind: "$items"
    },
    {
      $group: {
        _id: "$items.product",
        totalQuantity: { $sum: "$items.quantity" },
        totalAmount: { $sum: "$items.total" }
      }
    },
    {
      $sort: { totalAmount: -1 }
    },
    {
      $limit: 5
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productDetails"
      }
    },
    {
      $project: {
        _id: 1,
        totalQuantity: 1,
        totalAmount: 1,
        productName: { $arrayElemAt: ["$productDetails.name", 0] },
        sku: { $arrayElemAt: ["$productDetails.sku", 0] }
      }
    }
  ]);
  
  // Get daily sales for chart
  const dailySales = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate },
        paymentStatus: { $ne: "cancelled" }
      } 
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$saleDate" } },
        count: { $sum: 1 },
        amount: { $sum: "$totalAmount" }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {
        totalSales,
        saleAmount,
        saleByPaymentStatus,
        saleByPaymentMethod,
        topSellingProducts,
        dailySales,
        dateRange: {
          startDate,
          endDate
        }
      },
      "Sale statistics retrieved successfully"
    ));
});

// Get daily sales report
const getDailySalesReport = asyncHandler(async (req, res) => {
  // Get date
  const date = req.query.date ? new Date(req.query.date) : new Date();
  
  // Set date range for the day
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  
  // Get sales for the day
  const sales = await Sale.find({
    saleDate: { $gte: startDate, $lte: endDate },
    paymentStatus: { $ne: "cancelled" }
  })
  .populate("items.product", "name sku")
  .populate("createdBy", "fullName")
  .sort({ saleDate: 1 });
  
  // Calculate totals
  const totals = {
    totalSales: sales.length,
    subTotal: 0,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: 0,
    paidAmount: 0,
    dueAmount: 0
  };
  
  sales.forEach(sale => {
    totals.subTotal += sale.subTotal;
    totals.taxAmount += sale.taxAmount;
    totals.discountAmount += sale.discountAmount;
    totals.totalAmount += sale.totalAmount;
    totals.paidAmount += sale.paidAmount;
    totals.dueAmount += sale.dueAmount;
  });
  
  // Get payment method breakdown
  const paymentMethodBreakdown = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate },
        paymentStatus: { $ne: "cancelled" }
      } 
    },
    {
      $group: {
        _id: "$paymentMethod",
        count: { $sum: 1 },
        amount: { $sum: "$totalAmount" }
      }
    }
  ]);
  
  // Get user sales breakdown
  const userSalesBreakdown = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate },
        paymentStatus: { $ne: "cancelled" }
      } 
    },
    {
      $group: {
        _id: "$createdBy",
        count: { $sum: 1 },
        amount: { $sum: "$totalAmount" }
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userDetails"
      }
    },
    {
      $project: {
        _id: 1,
        count: 1,
        amount: 1,
        userName: { $arrayElemAt: ["$userDetails.fullName", 0] }
      }
    }
  ]);
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {
        date: startDate,
        sales,
        totals,
        paymentMethodBreakdown,
        userSalesBreakdown
      },
      "Daily sales report retrieved successfully"
    ));
});

// Get monthly sales report
const getMonthlySalesReport = asyncHandler(async (req, res) => {
  // Get month and year
  const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
  const month = req.query.month ? parseInt(req.query.month) - 1 : new Date().getMonth(); // 0-indexed month
  
  // Set date range for the month
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
  
  // Get daily sales for the month
  const dailySales = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate },
        paymentStatus: { $ne: "cancelled" }
      } 
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$saleDate" } },
        count: { $sum: 1 },
        amount: { $sum: "$totalAmount" }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
  
  // Calculate monthly totals
  const totals = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate },
        paymentStatus: { $ne: "cancelled" }
      } 
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: 1 },
        subTotal: { $sum: "$subTotal" },
        taxAmount: { $sum: "$taxAmount" },
        discountAmount: { $sum: "$discountAmount" },
        totalAmount: { $sum: "$totalAmount" },
        paidAmount: { $sum: "$paidAmount" },
        dueAmount: { $sum: "$dueAmount" }
      }
    }
  ]);
  
  // Get payment status breakdown
  const paymentStatusBreakdown = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate }
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
  
  // Get top selling products for the month
  const topSellingProducts = await Sale.aggregate([
    { 
      $match: { 
        saleDate: { $gte: startDate, $lte: endDate },
        paymentStatus: { $ne: "cancelled" }
      } 
    },
    {
      $unwind: "$items"
    },
    {
      $group: {
        _id: "$items.product",
        totalQuantity: { $sum: "$items.quantity" },
        totalAmount: { $sum: "$items.total" }
      }
    },
    {
      $sort: { totalAmount: -1 }
    },
    {
      $limit: 10
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productDetails"
      }
    },
    {
      $project: {
        _id: 1,
        totalQuantity: 1,
        totalAmount: 1,
        productName: { $arrayElemAt: ["$productDetails.name", 0] },
        sku: { $arrayElemAt: ["$productDetails.sku", 0] }
      }
    }
  ]);
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {
        year,
        month: month + 1,
        dateRange: {
          startDate,
          endDate
        },
        dailySales,
        totals: totals.length > 0 ? totals[0] : {
          totalSales: 0,
          subTotal: 0,
          taxAmount: 0,
          discountAmount: 0,
          totalAmount: 0,
          paidAmount: 0,
          dueAmount: 0
        },
        paymentStatusBreakdown,
        topSellingProducts
      },
      "Monthly sales report retrieved successfully"
    ));
});

export {
  getAllSales,
  createSale,
  getSaleById,
  updateSale,
  cancelSale,
  getSaleStats,
  getDailySalesReport,
  getMonthlySalesReport
};
