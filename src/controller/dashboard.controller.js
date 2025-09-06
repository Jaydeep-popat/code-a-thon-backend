import mongoose from "mongoose";
import { Product } from "../models/product.model.js";
import { Sale } from "../models/sale.model.js";
import { Purchase } from "../models/purchase.model.js";
import { Category } from "../models/category.model.js";
import { User } from "../models/user.model.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * @description Get dashboard overview statistics
 * @route GET /api/dashboard/overview
 * @access Admin, Manager
 */
const getDashboardOverview = asyncHandler(async (req, res) => {
  // Get counts
  const totalProducts = await Product.countDocuments();
  const totalCategories = await Category.countDocuments();
  const totalUsers = await User.countDocuments();

  // Get products with low stock
  const lowStockThreshold = 10; // Define threshold for low stock
  const lowStockProducts = await Product.countDocuments({ 
    stockQuantity: { $lte: lowStockThreshold } 
  });

  // Get sales statistics
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todaySales = await Sale.aggregate([
    { $match: { createdAt: { $gte: today }, status: { $ne: "cancelled" } } },
    { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
  ]);

  // Get month to date sales
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthToDateSales = await Sale.aggregate([
    { $match: { createdAt: { $gte: startOfMonth }, status: { $ne: "cancelled" } } },
    { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
  ]);

  // Get purchases statistics
  const todayPurchases = await Purchase.aggregate([
    { $match: { createdAt: { $gte: today }, status: { $ne: "cancelled" } } },
    { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
  ]);

  const monthToDatePurchases = await Purchase.aggregate([
    { $match: { createdAt: { $gte: startOfMonth }, status: { $ne: "cancelled" } } },
    { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
  ]);

  // Get top selling products
  const topSellingProducts = await Sale.aggregate([
    { $match: { status: { $ne: "cancelled" } } },
    { $unwind: "$items" },
    { 
      $group: { 
        _id: "$items.product", 
        totalQuantity: { $sum: "$items.quantity" },
        totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
      } 
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: 5 },
    { 
      $lookup: { 
        from: "products", 
        localField: "_id", 
        foreignField: "_id", 
        as: "productDetails" 
      } 
    },
    { $unwind: "$productDetails" },
    { 
      $project: { 
        _id: 1, 
        name: "$productDetails.name", 
        sku: "$productDetails.sku",
        totalQuantity: 1,
        totalRevenue: 1
      } 
    }
  ]);

  return res.status(200).json(
    new apiResponse(200, {
      counts: {
        products: totalProducts,
        categories: totalCategories,
        users: totalUsers,
        lowStockProducts
      },
      sales: {
        today: todaySales[0] || { total: 0, count: 0 },
        monthToDate: monthToDateSales[0] || { total: 0, count: 0 }
      },
      purchases: {
        today: todayPurchases[0] || { total: 0, count: 0 },
        monthToDate: monthToDatePurchases[0] || { total: 0, count: 0 }
      },
      topSellingProducts
    }, "Dashboard overview retrieved successfully")
  );
});

/**
 * @description Get sales trend data for charts
 * @route GET /api/dashboard/sales-trend
 * @access Admin, Manager
 */
const getSalesTrend = asyncHandler(async (req, res) => {
  const { period = "week" } = req.query;
  
  let groupBy;
  let dateFormat;
  let startDate = new Date();
  let dateField = "$createdAt";
  
  // Set period parameters
  switch (period) {
    case "week":
      // Last 7 days, group by day
      startDate.setDate(startDate.getDate() - 7);
      groupBy = { $dateToString: { format: "%Y-%m-%d", date: dateField } };
      dateFormat = "%Y-%m-%d";
      break;
    case "month":
      // Last 30 days, group by day
      startDate.setDate(startDate.getDate() - 30);
      groupBy = { $dateToString: { format: "%Y-%m-%d", date: dateField } };
      dateFormat = "%Y-%m-%d";
      break;
    case "year":
      // Last 12 months, group by month
      startDate.setMonth(startDate.getMonth() - 12);
      groupBy = { 
        year: { $year: dateField },
        month: { $month: dateField }
      };
      dateFormat = "%Y-%m";
      break;
    default:
      // Default to week
      startDate.setDate(startDate.getDate() - 7);
      groupBy = { $dateToString: { format: "%Y-%m-%d", date: dateField } };
      dateFormat = "%Y-%m-%d";
  }

  // Generate sales trend
  const salesTrend = await Sale.aggregate([
    { $match: { createdAt: { $gte: startDate }, status: { $ne: "cancelled" } } },
    { 
      $group: {
        _id: period === "year" 
          ? { year: { $year: dateField }, month: { $month: dateField } }
          : { $dateToString: { format: dateFormat, date: dateField } },
        totalSales: { $sum: "$totalAmount" },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        date: period === "year"
          ? { $concat: [{ $toString: "$_id.year" }, "-", { $toString: "$_id.month" }] }
          : "$_id",
        totalSales: 1,
        count: 1
      }
    },
    { $sort: { date: 1 } }
  ]);

  // Generate purchase trend for comparison
  const purchaseTrend = await Purchase.aggregate([
    { $match: { createdAt: { $gte: startDate }, status: { $ne: "cancelled" } } },
    { 
      $group: {
        _id: period === "year" 
          ? { year: { $year: dateField }, month: { $month: dateField } }
          : { $dateToString: { format: dateFormat, date: dateField } },
        totalPurchases: { $sum: "$totalAmount" },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        date: period === "year"
          ? { $concat: [{ $toString: "$_id.year" }, "-", { $toString: "$_id.month" }] }
          : "$_id",
        totalPurchases: 1,
        count: 1
      }
    },
    { $sort: { date: 1 } }
  ]);

  return res.status(200).json(
    new apiResponse(200, {
      salesTrend,
      purchaseTrend
    }, "Sales trend data retrieved successfully")
  );
});

/**
 * @description Get inventory value statistics
 * @route GET /api/dashboard/inventory-value
 * @access Admin, Manager
 */
const getInventoryValue = asyncHandler(async (req, res) => {
  // Calculate total inventory value and counts by category
  const inventoryByCategory = await Product.aggregate([
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "categoryDetails"
      }
    },
    {
      $unwind: "$categoryDetails"
    },
    {
      $group: {
        _id: "$category",
        categoryName: { $first: "$categoryDetails.name" },
        totalProducts: { $sum: 1 },
        totalValue: { $sum: { $multiply: ["$stockQuantity", "$costPrice"] } },
        totalItems: { $sum: "$stockQuantity" }
      }
    },
    {
      $sort: { totalValue: -1 }
    }
  ]);

  // Calculate total inventory value
  const totalInventoryValue = inventoryByCategory.reduce(
    (sum, category) => sum + category.totalValue, 
    0
  );

  // Calculate products with highest stock value
  const highValueProducts = await Product.aggregate([
    {
      $project: {
        name: 1,
        sku: 1,
        stockQuantity: 1,
        costPrice: 1,
        stockValue: { $multiply: ["$stockQuantity", "$costPrice"] }
      }
    },
    {
      $sort: { stockValue: -1 }
    },
    {
      $limit: 5
    }
  ]);

  return res.status(200).json(
    new apiResponse(200, {
      totalInventoryValue,
      inventoryByCategory,
      highValueProducts
    }, "Inventory value statistics retrieved successfully")
  );
});

/**
 * @description Get profitability analysis
 * @route GET /api/dashboard/profitability
 * @access Admin, Manager
 */
const getProfitabilityAnalysis = asyncHandler(async (req, res) => {
  // Set date range (default to last 30 days)
  const { startDate, endDate } = req.query;
  
  const start = startDate ? new Date(startDate) : new Date();
  if (!startDate) start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  
  const end = endDate ? new Date(endDate) : new Date();
  if (endDate) {
    end.setHours(23, 59, 59, 999);
  }

  // Calculate total sales and cost of goods sold
  const salesData = await Sale.aggregate([
    { 
      $match: { 
        createdAt: { $gte: start, $lte: end },
        status: { $ne: "cancelled" }
      } 
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: null,
        totalSales: { $sum: "$totalAmount" },
        totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        totalCostOfGoodsSold: { $sum: { $multiply: ["$items.costPrice", "$items.quantity"] } }
      }
    }
  ]);

  // Calculate profitability by product category
  const profitabilityByCategory = await Sale.aggregate([
    { 
      $match: { 
        createdAt: { $gte: start, $lte: end },
        status: { $ne: "cancelled" }
      } 
    },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "productDetails"
      }
    },
    {
      $unwind: "$productDetails"
    },
    {
      $lookup: {
        from: "categories",
        localField: "productDetails.category",
        foreignField: "_id",
        as: "categoryDetails"
      }
    },
    {
      $unwind: "$categoryDetails"
    },
    {
      $group: {
        _id: "$productDetails.category",
        categoryName: { $first: "$categoryDetails.name" },
        totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        totalCost: { $sum: { $multiply: ["$items.costPrice", "$items.quantity"] } },
        totalQuantitySold: { $sum: "$items.quantity" }
      }
    },
    {
      $project: {
        _id: 1,
        categoryName: 1,
        totalRevenue: 1,
        totalCost: 1,
        totalQuantitySold: 1,
        grossProfit: { $subtract: ["$totalRevenue", "$totalCost"] },
        profitMargin: { 
          $multiply: [
            { $divide: [
              { $subtract: ["$totalRevenue", "$totalCost"] },
              { $cond: [{ $eq: ["$totalRevenue", 0] }, 1, "$totalRevenue"] }
            ] },
            100
          ]
        }
      }
    },
    {
      $sort: { grossProfit: -1 }
    }
  ]);

  // Most profitable products
  const mostProfitableProducts = await Sale.aggregate([
    { 
      $match: { 
        createdAt: { $gte: start, $lte: end },
        status: { $ne: "cancelled" }
      } 
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        totalCost: { $sum: { $multiply: ["$items.costPrice", "$items.quantity"] } },
        totalQuantitySold: { $sum: "$items.quantity" }
      }
    },
    {
      $project: {
        _id: 1,
        totalRevenue: 1,
        totalCost: 1,
        totalQuantitySold: 1,
        grossProfit: { $subtract: ["$totalRevenue", "$totalCost"] },
        profitMargin: { 
          $multiply: [
            { $divide: [
              { $subtract: ["$totalRevenue", "$totalCost"] },
              { $cond: [{ $eq: ["$totalRevenue", 0] }, 1, "$totalRevenue"] }
            ] },
            100
          ]
        }
      }
    },
    {
      $sort: { grossProfit: -1 }
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
        name: "$productDetails.name",
        sku: "$productDetails.sku",
        totalRevenue: 1,
        totalCost: 1,
        totalQuantitySold: 1,
        grossProfit: 1,
        profitMargin: 1
      }
    }
  ]);

  // Overall profitability
  const overallProfitability = salesData.length > 0 ? {
    totalSales: salesData[0].totalSales,
    totalRevenue: salesData[0].totalRevenue,
    totalCostOfGoodsSold: salesData[0].totalCostOfGoodsSold,
    grossProfit: salesData[0].totalRevenue - salesData[0].totalCostOfGoodsSold,
    profitMargin: ((salesData[0].totalRevenue - salesData[0].totalCostOfGoodsSold) / salesData[0].totalRevenue) * 100
  } : {
    totalSales: 0,
    totalRevenue: 0,
    totalCostOfGoodsSold: 0,
    grossProfit: 0,
    profitMargin: 0
  };

  return res.status(200).json(
    new apiResponse(200, {
      overallProfitability,
      profitabilityByCategory,
      mostProfitableProducts
    }, "Profitability analysis retrieved successfully")
  );
});

export {
  getDashboardOverview,
  getSalesTrend,
  getInventoryValue,
  getProfitabilityAnalysis
};
