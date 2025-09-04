
import { Router } from "express";
import {
    registerUser,
    loginUser,
    logoutUser,
    verifyOTP,
    resendOTP,
    forgotPassword,
    resetPassword,
    getCurrentUser
} from "../controller/auth.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(registerUser);
router.route("/login").post(loginUser);
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/verify-otp").post(verifyOTP);
router.route("/resend-otp").post(resendOTP);
router.route("/forgot-password").post(forgotPassword);
router.route("/reset-password").post(resetPassword);
router.route("/me").get(verifyJWT, getCurrentUser);

export default router;
