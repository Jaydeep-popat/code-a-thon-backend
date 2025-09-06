import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictTo } from "../middlewares/role.middleware.js";
import { 
  getAllPurchases, 
  createPurchase, 
  getPurchaseById, 
  updatePurchase, 
  cancelPurchase, 
  getPurchaseStats 
} from "../controller/purchase.controller.js";

const router = Router();

// All purchase routes require authentication
router.use(verifyJWT);

// GET all purchases - accessible to admin, manager, and inventory
router.route("/").get(restrictTo(["admin", "manager", "inventory"]), getAllPurchases);

// POST create a new purchase - restricted to admin and manager
router.route("/").post(restrictTo(["admin", "manager"]), createPurchase);

// GET purchase statistics
router.route("/stats").get(restrictTo(["admin", "manager"]), getPurchaseStats);

// GET, UPDATE, CANCEL single purchase by ID
router.route("/:id")
   .get(restrictTo(["admin", "manager", "inventory"]), getPurchaseById)
   .patch(restrictTo(["admin", "manager"]), updatePurchase);

// Cancel purchase
router.route("/:id/cancel").patch(restrictTo(["admin", "manager"]), cancelPurchase);

export default router;
