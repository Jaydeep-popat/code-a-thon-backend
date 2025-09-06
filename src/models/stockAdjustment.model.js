import mongoose from "mongoose";

const stockAdjustmentSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    type: {
      type: String,
      enum: ["addition", "subtraction", "damage", "loss", "return", "correction", "other"],
      required: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        previousQuantity: {
          type: Number,
          required: true,
          min: 0,
        },
        adjustmentQuantity: {
          type: Number,
          required: true,
        },
        newQuantity: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export const StockAdjustment = mongoose.model("StockAdjustment", stockAdjustmentSchema);
