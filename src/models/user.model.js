import Mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// Define the User schema
const userSchema = new Mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: function() {
        // Password is not required for OAuth users
        return this.provider ? false : true;
      },
      minlength: 8,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationExpires: {
      type: Date,
      default: function() {
        return new Date(Date.now() + 1 * 60 * 60 * 1000);
      },
      expires: 0
    },
    role: {
      type: String,
      enum: ["dummy", "dummy2", "dummy3"], // Define user roles
      default: "dummy",
    },
    // OAuth fields
    provider: {
      type: String,
      enum: [null, 'google', 'github'],
      default: null
    },
    providerId: {
      type: String,
      default: null
    },
    providerData: {
      type: Object,
      default: null
    },
    refreshToken: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now(),
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      fullName: this.fullName,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

// Export the model

export const User = Mongoose.model("User", userSchema);
