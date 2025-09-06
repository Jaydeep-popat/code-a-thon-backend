import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { apiResponse } from "../utils/apiResponse.js";

/**
 * @description Create an admin user using a secret key
 * @route POST /api/auth/create-admin
 * @access Public (with secret key)
 */
const createAdminUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password, secretKey } = req.body;

  // Validate the secret key
  if (secretKey !== process.env.ADMIN_SECRET_KEY) {
    throw new ApiError(401, "Invalid secret key");
  }

  if ([fullName, email, username, password].some((field) => !field || field.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  const user = await User.create({
    fullName,
    email,
    password,
    username,
    role: "admin",
    isVerified: true
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while creating the admin user");
  }

  return res.status(201).json(
    new apiResponse(201, createdUser, "Admin user created successfully")
  );
});

export { createAdminUser };
