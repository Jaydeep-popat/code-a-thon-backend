import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { configurePassport } from './utils/oauthService.js';

const app = express();

app.use(cors({
        origin: process.env.CORS_ORIGIN,
        credentials: true
}))


app.use(express.json({limit: "20kb"}));
app.use(express.urlencoded({extended: true,limit:"20kb"}));
app.use(express.static("public"));
app.use(cookieParser());

// Initialize Passport and configure strategies
configurePassport();
app.use(passport.initialize());

// Import routers
import authRouter from "./router/auth.router.js";
import oauthRouter from "./router/oauth.router.js";
import userRouter from "./router/user.router.js";
import categoryRouter from "./router/category.router.js";
import productRouter from "./router/product.router.js";
import supplierRouter from "./router/supplier.router.js";
import purchaseRouter from "./router/purchase.router.js";
import saleRouter from "./router/sale.router.js";
import stockAdjustmentRouter from "./router/stockAdjustment.router.js";
import dashboardRouter from "./router/dashboard.router.js";
import adminRouter from "./router/admin.router.js";

// Apply routes
app.use("/api/auth", authRouter);
app.use("/api/oauth", oauthRouter);
app.use("/api/users", userRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/products", productRouter);
app.use("/api/suppliers", supplierRouter);
app.use("/api/purchases", purchaseRouter);
app.use("/api/sales", saleRouter);
app.use("/api/stock-adjustments", stockAdjustmentRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/admin", adminRouter);

export { app };
