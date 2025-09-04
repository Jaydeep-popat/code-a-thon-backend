import nodemailer from "nodemailer";
import { ApiError } from "./apiError.js";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Generate a random 4-digit OTP
 * @returns {string} 4-digit OTP
 */
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

/**
 * Send an OTP to the user's email for verification
 * @param {string} email - recipient email address
 * @param {string} otp - 4-digit OTP to send
 * @param {string} name - name of the recipient
 * @returns {Promise<boolean>} true if email sent successfully
 */
const sendVerificationEmail = async (email, otp, name) => {
  try {
    const mailOptions = {
      from: `"FROLIC" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Account Verification OTP",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333;">Welcome to FROLIC!</h2>
          <p>Hello ${name},</p>
          <p>Thank you for registering with us. To complete your registration, please use the following OTP to verify your email address:</p>
          <div style="background-color: #f5f5f5; padding: 10px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This OTP is valid for 10 minutes only.</p>
          <p>If you did not request this verification, please ignore this email.</p>
          <p>Best regards,<br/>The FROLIC Team</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email: ", error);
    throw new ApiError(500, "Failed to send verification email");
  }
};

/**
 * Send a password reset OTP to the user's email
 * @param {string} email - recipient email address
 * @param {string} otp - 4-digit OTP to send
 * @param {string} name - name of the recipient
 * @returns {Promise<boolean>} true if email sent successfully
 */
const sendPasswordResetEmail = async (email, otp, name) => {
  try {
    const mailOptions = {
      from: `"FROLIC" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hello ${name},</p>
          <p>We received a request to reset your password. Please use the following OTP to reset your password:</p>
          <div style="background-color: #f5f5f5; padding: 10px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This OTP is valid for 10 minutes only.</p>
          <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
          <p>Best regards,<br/>The FROLIC Team</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Password reset email sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending password reset email: ", error);
    throw new ApiError(500, "Failed to send password reset email");
  }
};

export { generateOTP, sendVerificationEmail, sendPasswordResetEmail };
