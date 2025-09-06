import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken"
import { User } from "../models/user.model.js";

export const verifyJWT = asyncHandler(async (req, _, next) => {
    try {
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")

        if (!token) {
            throw new ApiError(401, "Unauthorized request")
        }

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken")
        if (!user) {
            throw new ApiError(401, "Invalid Access Token")
        }
        
        // Check if user's email is verified
        if (!user.isVerified) {
            throw new ApiError(403, "Email not verified. Please verify your email before accessing this resource.")
        }
        
        req.user = user;
        next()
    } catch (error) {
        console.log(error)
        throw new ApiError(401, error?.message || "Invalid access token")
    }
})
