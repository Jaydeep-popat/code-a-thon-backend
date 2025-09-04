import mongoose from "mongoose";

const verificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // The document will be automatically deleted after 10 minutes (600 seconds)
  },
});

export const Verification = mongoose.model("Verification", verificationSchema);
