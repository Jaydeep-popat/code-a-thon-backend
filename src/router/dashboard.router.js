import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictTo } from "../middlewares/role.middleware.js";
import { 
  getDashboardOverview,
  getSalesTrend,
  getInventoryValue,
  getProfitabilityAnalysis
} from "../controller/dashboard.controller.js";

const router = Router();

// All dashboard routes require authentication
router.use(verifyJWT);

// Dashboard overview endpoint - restricted to admin and manager
router.route("/overview")
  .get(restrictTo(["admin", "manager"]), getDashboardOverview);

// Sales trend data for charts - restricted to admin and manager
router.route("/sales-trend")
  .get(restrictTo(["admin", "manager"]), getSalesTrend);

// Inventory value statistics - restricted to admin and manager
router.route("/inventory-value")
  .get(restrictTo(["admin", "manager"]), getInventoryValue);

// Profitability analysis - restricted to admin only
router.route("/profitability")
  .get(restrictTo(["admin"]), getProfitabilityAnalysis);

export default router;
