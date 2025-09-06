import { Router } from "express";
import { createAdminUser } from "../controller/admin.controller.js";

const router = Router();

// Create admin user with secret key
router.route("/create-admin").post(createAdminUser);

export default router;
