import { Router } from "express";
import {
  googleAuthInit,
  googleAuthCallback,
  githubAuthInit,
  githubAuthCallback,
} from "../controller/oauth.controller.js";
import { getCurrentUser } from "../controller/auth.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Google OAuth routes
router.route("/google").get(googleAuthInit);
router.route("/google/callback").get(googleAuthCallback);

// GitHub OAuth routes
router.route("/github").get(githubAuthInit);
router.route("/github/callback").get(githubAuthCallback);

// Get current user profile
router.route("/me").get(verifyJWT, getCurrentUser);

export default router;
