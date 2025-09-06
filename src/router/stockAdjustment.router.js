import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictTo } from "../middlewares/role.middleware.js";
import { 
  createStockAdjustment,
  getAllStockAdjustments,
  getStockAdjustmentById,
  getStockAdjustmentStats
} from "../controller/stockAdjustment.controller.js";

const router = Router();

// All stock adjustment routes require authentication
router.use(verifyJWT);

// GET all stock adjustments - accessible to admin, manager, and inventory
router.route("/")
  .get(restrictTo(["admin", "manager", "inventory"]), getAllStockAdjustments)
  .post(restrictTo(["admin", "manager", "inventory"]), createStockAdjustment);

// GET stock adjustment statistics
router.route("/stats")
  .get(restrictTo(["admin", "manager"]), getStockAdjustmentStats);

// GET stock adjustment by ID
router.route("/:id")
  .get(restrictTo(["admin", "manager", "inventory"]), getStockAdjustmentById);

export default router;
