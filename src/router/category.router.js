import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictTo } from "../middlewares/role.middleware.js";
import { 
  getAllCategories, 
  createCategory, 
  getCategoryById, 
  updateCategory, 
  deleteCategory 
} from "../controller/category.controller.js";

const router = Router();

// All category routes require authentication
router.use(verifyJWT);

// GET all categories - accessible to all authenticated users
router.route("/").get(getAllCategories);

// POST create a new category - restricted to admin and manager
router.route("/").post(restrictTo(["admin", "manager"]), createCategory);

// GET, UPDATE, DELETE single category by ID
router.route("/:id")
   .get(getCategoryById)
   .patch(restrictTo(["admin", "manager"]), updateCategory)
   .delete(restrictTo(["admin"]), deleteCategory);

export default router;
