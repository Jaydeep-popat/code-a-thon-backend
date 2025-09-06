import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { config } from "dotenv";
import bcrypt from "bcrypt";

// Load environment variables
config();

// Function to create admin user
const createAdminUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Check if admin already exists
    const adminExists = await User.findOne({ role: "admin" });
    if (adminExists) {
      console.log("Admin user already exists");
      return;
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash("Admin@123", 10);
    const adminUser = await User.create({
      fullName: "System Admin",
      email: "admin@stockmanager.com",
      username: "admin",
      password: hashedPassword,
      role: "admin",
      isVerified: true
    });

    console.log("Admin user created successfully:", adminUser.username);
  } catch (error) {
    console.error("Error creating admin user:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
};

// Run the function
createAdminUser();
