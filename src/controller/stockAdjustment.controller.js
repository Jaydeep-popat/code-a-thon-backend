import mongoose from "mongoose";
import { StockAdjustment } from "../models/stockAdjustment.model.js";
import { Product } from "../models/product.model.js";
import { ApiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * @description Create a new stock adjustment
 * @route POST /api/stock-adjustments
 * @access Admin, Manager, Inventory
 */
const createStockAdjustment = asyncHandler(async (req, res) => {
  const { productId, adjustmentType, quantity, reason } = req.body;

  if (!productId || !adjustmentType || !quantity || !reason) {
    throw new ApiError(400, "All fields are required");
  }

  if (adjustmentType !== "increase" && adjustmentType !== "decrease") {
    throw new ApiError(400, "Adjustment type must be either 'increase' or 'decrease'");
  }

  if (quantity <= 0) {
    throw new ApiError(400, "Quantity must be greater than 0");
  }

  // Find the product
  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  // Check if decreasing more than available (only for decrease type)
  if (adjustmentType === "decrease" && product.stockQuantity < quantity) {
    throw new ApiError(400, `Cannot decrease more than available. Current stock: ${product.stockQuantity}`);
  }

  // Start a transaction to ensure data consistency
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Create stock adjustment record
    const stockAdjustment = await StockAdjustment.create([{
      product: productId,
      adjustmentType,
      quantity,
      reason,
      createdBy: req.user._id
    }], { session });

    // Update product stock quantity
    const newQuantity = adjustmentType === "increase" 
      ? product.stockQuantity + quantity 
      : product.stockQuantity - quantity;

    await Product.findByIdAndUpdate(
      productId,
      { 
        stockQuantity: newQuantity,
        $push: { 
          stockHistory: {
            type: "adjustment",
            quantity: adjustmentType === "increase" ? quantity : -quantity,
            date: new Date(),
            reference: stockAdjustment[0]._id
          } 
        }
      },
      { session }
    );

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json(
      new apiResponse(201, stockAdjustment[0], "Stock adjusted successfully")
    );
  } catch (error) {
    // Abort transaction in case of error
    await session.abortTransaction();
    session.endSession();
    throw new ApiError(500, error?.message || "Something went wrong while adjusting stock");
  }
});

/**
 * @description Get all stock adjustments with pagination and filtering
 * @route GET /api/stock-adjustments
 * @access Admin, Manager, Inventory
 */
const getAllStockAdjustments = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    productId, 
    adjustmentType, 
    startDate, 
    endDate, 
    sortBy = "createdAt", 
    sortOrder = "desc" 
  } = req.query;

  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);
  const skip = (pageNumber - 1) * limitNumber;

  // Build filter object
  const filter = {};
  
  if (productId) filter.product = productId;
  if (adjustmentType) filter.adjustmentType = adjustmentType;
  
  // Date range filter
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = endDateTime;
    }
  }

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  // Execute query with pagination
  const stockAdjustments = await StockAdjustment.find(filter)
    .populate("product", "name sku")
    .populate("createdBy", "username email")
    .sort(sort)
    .skip(skip)
    .limit(limitNumber);

  // Get total count for pagination
  const totalCount = await StockAdjustment.countDocuments(filter);

  return res.status(200).json(
    new apiResponse(200, {
      stockAdjustments,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: limitNumber,
        pages: Math.ceil(totalCount / limitNumber)
      }
    }, "Stock adjustments retrieved successfully")
  );
});

/**
 * @description Get a single stock adjustment by ID
 * @route GET /api/stock-adjustments/:id
 * @access Admin, Manager, Inventory
 */
const getStockAdjustmentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const stockAdjustment = await StockAdjustment.findById(id)
    .populate("product", "name sku category stockQuantity")
    .populate("createdBy", "username email");

  if (!stockAdjustment) {
    throw new ApiError(404, "Stock adjustment not found");
  }

  return res.status(200).json(
    new apiResponse(200, stockAdjustment, "Stock adjustment retrieved successfully")
  );
});

/**
 * @description Get stock adjustment statistics
 * @route GET /api/stock-adjustments/stats
 * @access Admin, Manager
 */
const getStockAdjustmentStats = asyncHandler(async (req, res) => {
  // Total count by adjustment type
  const adjustmentTypeCounts = await StockAdjustment.aggregate([
    {
      $group: {
        _id: "$adjustmentType",
        count: { $sum: 1 },
        totalQuantity: { $sum: "$quantity" }
      }
    }
  ]);

  // Most frequently adjusted products
  const topAdjustedProducts = await StockAdjustment.aggregate([
    {
      $group: {
        _id: "$product",
        count: { $sum: 1 },
        totalIncreases: {
          $sum: {
            $cond: [{ $eq: ["$adjustmentType", "increase"] }, "$quantity", 0]
          }
        },
        totalDecreases: {
          $sum: {
            $cond: [{ $eq: ["$adjustmentType", "decrease"] }, "$quantity", 0]
          }
        }
      }
    },
    {
      $sort: { count: -1 }
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
      $unwind: "$productDetails"
    },
    {
      $project: {
        _id: 1,
        productName: "$productDetails.name",
        productSku: "$productDetails.sku",
        count: 1,
        totalIncreases: 1,
        totalDecreases: 1,
        netChange: { $subtract: ["$totalIncreases", "$totalDecreases"] }
      }
    }
  ]);

  // Common reasons for adjustments
  const commonReasons = await StockAdjustment.aggregate([
    {
      $group: {
        _id: "$reason",
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: 5
    }
  ]);

  // Recent trend (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentTrend = await StockAdjustment.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          type: "$adjustmentType"
        },
        count: { $sum: 1 },
        totalQuantity: { $sum: "$quantity" }
      }
    },
    {
      $sort: { "_id.date": 1 }
    }
  ]);

  return res.status(200).json(
    new apiResponse(200, {
      adjustmentTypeCounts,
      topAdjustedProducts,
      commonReasons,
      recentTrend
    }, "Stock adjustment statistics retrieved successfully")
  );
});

export {
  createStockAdjustment,
  getAllStockAdjustments,
  getStockAdjustmentById,
  getStockAdjustmentStats
};
