import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictTo } from "../middlewares/role.middleware.js";
import { 
  getAllProducts, 
  createProduct, 
  getProductById, 
  getProductsByCategory, 
  updateProduct, 
  deleteProduct, 
  getLowStockProducts, 
  searchProducts 
} from "../controller/product.controller.js";

const router = Router();

// All product routes require authentication
router.use(verifyJWT);

// GET all products - accessible to all authenticated users
router.route("/").get(getAllProducts);

// POST create a new product - restricted to admin and manager
router.route("/").post(restrictTo(["admin", "manager"]), createProduct);

// GET products by category
router.route("/category/:categoryId").get(getProductsByCategory);

// GET low stock products
router.route("/low-stock").get(restrictTo(["admin", "manager", "inventory"]), getLowStockProducts);

// GET product search
router.route("/search").get(searchProducts);

// GET, UPDATE, DELETE single product by ID
router.route("/:id")
   .get(getProductById)
   .patch(restrictTo(["admin", "manager"]), updateProduct)
   .delete(restrictTo(["admin"]), deleteProduct);

export default router;
