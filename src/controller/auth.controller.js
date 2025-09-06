import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { Verification } from "../models/verification.model.js";
import { PasswordReset } from "../models/passwordReset.model.js";
import { apiResponse } from "../utils/apiResponse.js";
import { generateOTP, sendVerificationEmail, sendPasswordResetEmail } from "../utils/emailService.js";
import jwt from "jsonwebtoken";

const registerUser = asyncHandler(async (req, res) => {

  const { fullName, email, username, password, role } = req.body;

  if (
    [fullName, email, username, password].some((field) => field === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  // Set default role to cashier if not provided or if trying to set admin role
  let userRole = role;
  if (!userRole || userRole === "admin") {
    userRole = "cashier"; // Default role
  }
  
  // Validate role
  const validRoles = ["manager", "cashier", "inventory", "viewer"];
  if (!validRoles.includes(userRole)) {
    userRole = "cashier"; // Default to cashier if invalid role
  }

  const user = await User.create({
    fullName,
    email,
    password,
    username,
    role: userRole,
    isVerified: false
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(409, "Something went wrong while creating user");
  }

  // Generate OTP for email verification
  const otp = generateOTP();

  // Save OTP to verification collection
  await Verification.create({
    user: user._id,
    email: user.email,
    otp
  });

  // Send verification email
  try {
    await sendVerificationEmail(email, otp, fullName);
  } catch (error) {
    console.error("Error sending verification email:", error);
    // Continue registration process even if email fails
  }

  return res
    .status(201)
    .json(new apiResponse(
      200,
      {
        user: createdUser,
        message: "Please check your email for verification OTP"
      },
      "User registered successfully. Verification email sent."
    ));
});

const loginUser = asyncHandler(async (req, res) => {

  const { email, username, password } = req.body;

  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }
  if (!password) {
    throw new ApiError(400, "please enter a password");
  }
  const user = await User.findOne({ $or: [{ username }, { email }] }).select("+password");

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // Check if user email is verified
  if (!user.isVerified) {
    // Generate new OTP for verification
    const otp = generateOTP();

    // Update or create verification record
    await Verification.findOneAndUpdate(
      { user: user._id },
      {
        user: user._id,
        email: user.email,
        otp
      },
      { upsert: true, new: true }
    );

    // Send verification email
    try {
      await sendVerificationEmail(user.email, otp, user.fullName);
    } catch (error) {
      console.error("Error sending verification email:", error);
    }

    throw new ApiError(403, "Email not verified. A new verification code has been sent to your email.");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(user._id);


  const loggedInUser = await User.findById(user._id).select("-password");

  const options = {
    httpOnly: false,
    secure: false,
    sameSite: "strict", // Prevent CSRF attacks
    maxAge: 30 * 60 * 1000, // 15 minutes for accessToken
  };

  const refreshTokenOptions = {
    ...options,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for refreshToken
  };


  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new apiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {

  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    {
      new: true,
    }
  );
  const options = {
    httpOnly: false,
    secure: false,
  };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new apiResponse(200, {}, "User logged Out"));
});

const verifyOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  // Find the user by email
  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Check if user is already verified
  if (user.isVerified) {
    return res
      .status(200)
      .json(new apiResponse(200, {}, "Email already verified"));
  }

  // Find verification record
  const verification = await Verification.findOne({
    user: user._id,
    email,
    otp
  });

  if (!verification) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  // Mark user as verified
  user.isVerified = true;
  // Remove the verification expiry time since the account is now verified
  user.verificationExpires = undefined;
  await user.save();

  // Delete verification record
  await Verification.findByIdAndDelete(verification._id);

  return res
    .status(200)
    .json(new apiResponse(200, {}, "Email verified successfully"));
});

const resendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  // Find the user by email
  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Check if user is already verified
  if (user.isVerified) {
    return res
      .status(200)
      .json(new apiResponse(200, {}, "Email already verified"));
  }

  // Generate new OTP
  const otp = generateOTP();

  // Extend the verification expiry time
  user.verificationExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // Extend by 48 hours
  await user.save();

  // Update or create verification record
  await Verification.findOneAndUpdate(
    { user: user._id },
    {
      user: user._id,
      email,
      otp
    },
    { upsert: true, new: true }
  );

  // Send verification email
  try {
    await sendVerificationEmail(email, otp, user.fullName);

    return res
      .status(200)
      .json(new apiResponse(200, {}, "Verification OTP sent successfully"));
  } catch (error) {
    throw new ApiError(500, "Failed to send verification email");
  }
});

const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token"
    );
  }
};

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new apiResponse(
      200,
      { user },
      "User profile fetched successfully"
    ));
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  // Find the user by email
  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Check if the user registered through social login
  if (user.provider) {
    throw new ApiError(400, "Password reset is not available for accounts created with social login. Please log in using your social account.");
  }

  // Generate OTP for password reset
  const otp = generateOTP();

  // Save OTP to password reset collection
  await PasswordReset.findOneAndUpdate(
    { user: user._id },
    {
      user: user._id,
      email,
      otp
    },
    { upsert: true, new: true }
  );

  // Send password reset email
  try {
    await sendPasswordResetEmail(email, otp, user.fullName);

    return res
      .status(200)
      .json(
        new apiResponse(
          200,
          {},
          "Password reset OTP sent to your email"
        )
      );
  } catch (error) {
    throw new ApiError(500, "Failed to send password reset email");
  }
});

// Reset password with OTP
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    throw new ApiError(400, "Email, OTP, and new password are required");
  }

  if (newPassword.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters long");
  }

  // Find the user by email
  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Check if the user registered through social login
  if (user.provider) {
    throw new ApiError(400, "Password reset is not available for accounts created with social login. Please log in using your social account.");
  }

  // Find password reset record
  const passwordReset = await PasswordReset.findOne({
    user: user._id,
    email,
    otp
  });

  if (!passwordReset) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Delete password reset record
  await PasswordReset.findByIdAndDelete(passwordReset._id);

  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        {},
        "Password reset successfully"
      )
    );
});

// Verify password reset OTP without changing password
const verifyResetOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  // Find the user by email
  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Check if the user registered through social login
  if (user.provider) {
    throw new ApiError(400, "Password reset is not available for accounts created with social login. Please log in using your social account.");
  }

  // Find password reset record
  const passwordReset = await PasswordReset.findOne({
    user: user._id,
    email,
    otp
  });

  if (!passwordReset) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        {},
        "OTP verified successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  verifyOTP,
  verifyResetOTP,
  resendOTP,
  getCurrentUser,
  forgotPassword,
  resetPassword
}

