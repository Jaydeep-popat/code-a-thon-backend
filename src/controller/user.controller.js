import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";

// Get all users (admin function)
const getAllUsers = asyncHandler(async (req, res) => {
  // Ensure the requester is an admin
  if (req.user.role !== "dummy3") {
    throw new ApiError(403, "You don't have permission to access this resource");
  }
  
  // Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  // Query users with pagination
  const users = await User.find()
    .select("-password -refreshToken")
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });
  
  // Get total count for pagination
  const totalUsers = await User.countDocuments();
  
  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        { 
          users,
          pagination: {
            totalUsers,
            totalPages: Math.ceil(totalUsers / limit),
            currentPage: page,
            perPage: limit
          }
        },
        "Users fetched successfully"
      )
    );
});

// Get user by ID (admin function or self)
const getUserById = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  
  // Ensure the requester is an admin or the user themselves
  if (req.user.role !== "dummy3" && req.user._id.toString() !== userId) {
    throw new ApiError(403, "You don't have permission to access this resource");
  }
  
  const user = await User.findById(userId).select("-password -refreshToken");
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        { user },
        "User fetched successfully"
      )
    );
});

// Update user account details
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName } = req.body;
  
  if (!fullName?.trim()) {
    throw new ApiError(400, "Full name is required");
  }
  
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        fullName: fullName
      }
    },
    { new: true }
  ).select("-password -refreshToken");
  
  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        { user },
        "Account details updated successfully"
      )
    );
});

// Change password
const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  
  if (!oldPassword || !newPassword) {
    throw new ApiError(400, "Old password and new password are required");
  }
  
  if (newPassword.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters long");
  }
  
  const user = await User.findById(req.user._id).select("+password");
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Check if the user registered through social login
  if (user.provider) {
    throw new ApiError(400, "Password change is not available for accounts created with social login. Please manage your account through your social provider.");
  }
  
  // Check if old password is correct
  const isPasswordValid = await user.isPasswordCorrect(oldPassword);
  
  if (!isPasswordValid) {
    throw new ApiError(400, "Invalid old password");
  }
  
  // Update password
  user.password = newPassword;
  await user.save();
  
  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        {},
        "Password changed successfully"
      )
    );
});

// Delete account
const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  // Delete the user
  const deletedUser = await User.findByIdAndDelete(userId);
  
  if (!deletedUser) {
    throw new ApiError(404, "User not found");
  }
  
  // Clear cookies
  const options = {
    httpOnly: false,
    secure: false,
  };
  
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
      new apiResponse(
        200,
        {},
        "Account deleted successfully"
      )
    );
});

export {
  getAllUsers,
  getUserById,
  updateAccountDetails,
  changePassword,
  deleteAccount
}
