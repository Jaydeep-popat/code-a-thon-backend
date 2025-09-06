import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictTo } from "../middlewares/role.middleware.js";
import { 
  getAllSales, 
  createSale, 
  getSaleById, 
  updateSale, 
  cancelSale, 
  getSaleStats, 
  getDailySalesReport, 
  getMonthlySalesReport 
} from "../controller/sale.controller.js";

const router = Router();

// All sale routes require authentication
router.use(verifyJWT);

// GET all sales - accessible to admin, manager, and cashier
router.route("/").get(restrictTo(["admin", "manager", "cashier"]), getAllSales);

// POST create a new sale - accessible to admin, manager, and cashier
router.route("/").post(restrictTo(["admin", "manager", "cashier"]), createSale);

// GET sale statistics
router.route("/stats").get(restrictTo(["admin", "manager"]), getSaleStats);

// GET daily sales report
router.route("/report/daily").get(restrictTo(["admin", "manager"]), getDailySalesReport);

// GET monthly sales report
router.route("/report/monthly").get(restrictTo(["admin", "manager"]), getMonthlySalesReport);

// GET, UPDATE single sale by ID
router.route("/:id")
   .get(restrictTo(["admin", "manager", "cashier"]), getSaleById)
   .patch(restrictTo(["admin", "manager"]), updateSale);

// Cancel sale
router.route("/:id/cancel").patch(restrictTo(["admin", "manager"]), cancelSale);

export default router;
