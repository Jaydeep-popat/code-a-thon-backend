import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { User } from "../models/user.model.js";
import { handleOAuthCallback } from "../utils/oauthService.js";
import passport from "passport";

/**
 * Initiates Google OAuth login flow
 */
const googleAuthInit = asyncHandler(async (req, res, next) => {
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

/**
 * Handles Google OAuth callback
 */
const googleAuthCallback = asyncHandler(async (req, res, next) => {
  passport.authenticate("google", { session: false }, async (err, user) => {
    try {
      if (err || !user) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=Authentication failed`);
      }

      const { accessToken, refreshToken } = await handleOAuthCallback(user);
      
      // Set cookies
      const options = {
        httpOnly: false,
        secure: false,
        sameSite: "strict",
        maxAge: 30 * 60 * 1000, // 30 minutes
      };
      
      const refreshTokenOptions = {
        ...options,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      };
      
      // Redirect to frontend with tokens
      res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, refreshTokenOptions)
        .redirect(`${process.env.FRONTEND_URL}/login/success`);
      
    } catch (error) {
      console.error("OAuth callback error:", error);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=Server error`);
    }
  })(req, res, next);
});

/**
 * Initiates GitHub OAuth login flow
 */
const githubAuthInit = asyncHandler(async (req, res, next) => {
  passport.authenticate("github", { scope: ["user:email"] })(req, res, next);
});

/**
 * Handles GitHub OAuth callback
 */
const githubAuthCallback = asyncHandler(async (req, res, next) => {
  passport.authenticate("github", { session: false }, async (err, user) => {
    try {
      if (err || !user) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=Authentication failed`);
      }

      const { accessToken, refreshToken } = await handleOAuthCallback(user);
      
      // Set cookies
      const options = {
        httpOnly: false,
        secure: false,
        sameSite: "strict",
        maxAge: 30 * 60 * 1000, // 30 minutes
      };
      
      const refreshTokenOptions = {
        ...options,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      };
      
      // Redirect to frontend with tokens
      res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, refreshTokenOptions)
        .redirect(`${process.env.FRONTEND_URL}/login/success`);
      
    } catch (error) {
      console.error("OAuth callback error:", error);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=Server error`);
    }
  })(req, res, next);
});

/**
 * Get the current user's profile from OAuth provider
 */


export {
  googleAuthInit,
  googleAuthCallback,
  githubAuthInit,
  githubAuthCallback,
};
