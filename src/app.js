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

// Apply routes
app.use("/api/auth", authRouter);
app.use("/api/oauth", oauthRouter);
app.use("/api/users", userRouter);

export { app };
