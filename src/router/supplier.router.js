import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictTo } from "../middlewares/role.middleware.js";
import { 
  getAllSuppliers, 
  createSupplier, 
  getSupplierById, 
  updateSupplier, 
  deleteSupplier
} from "../controller/supplier.controller.js";

const router = Router();

// All supplier routes require authentication
router.use(verifyJWT);

// GET all suppliers - accessible to admin, manager, and inventory
router.route("/").get(restrictTo(["admin", "manager", "inventory"]), getAllSuppliers);

// POST create a new supplier - restricted to admin and manager
router.route("/").post(restrictTo(["admin", "manager"]), createSupplier);

// GET, UPDATE, DELETE single supplier by ID
router.route("/:id")
   .get(restrictTo(["admin", "manager", "inventory"]), getSupplierById)
   .patch(restrictTo(["admin", "manager"]), updateSupplier)
   .delete(restrictTo(["admin"]), deleteSupplier);

export default router;
