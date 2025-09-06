import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
      unique: true,
      required: true,
    },
    barcode: {
      type: String,
      trim: true,
      unique: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    sellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    discountPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    minQuantity: {
      type: Number,
      default: 10,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
      enum: ["piece", "kg", "liter", "meter", "pack", "other"],
      default: "piece",
    },
    unitValue: {
      type: Number,
      default: 1,
      min: 0,
    },
    images: [{
      url: {
        type: String,
      },
      publicId: {
        type: String,
      },
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
    expiryDate: {
      type: Date,
    },
    manufacturingDate: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Add index for faster search
productSchema.index({ name: "text", description: "text", sku: "text", barcode: "text" });

export const Product = mongoose.model("Product", productSchema);
