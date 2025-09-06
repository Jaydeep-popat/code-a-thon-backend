import { Router } from "express";
import {
  getAllUsers,
  getUserById,
  updateAccountDetails,
  changePassword,
  deleteAccount,
  updateUserRole
} from "../controller/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictTo } from "../middlewares/role.middleware.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// User management routes
router.route("/").get(restrictTo(["admin"]), getAllUsers);
router.route("/:id").get(getUserById);
router.route("/update-account").patch(updateAccountDetails);
router.route("/change-password").post(changePassword);
router.route("/delete-account").delete(deleteAccount);
router.route("/update-role").patch(restrictTo(["admin"]), updateUserRole);

export default router;
