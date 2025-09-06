import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Category } from "../models/category.model.js";

// Get all categories
const getAllCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort({ name: 1 });
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      categories,
      "Categories retrieved successfully"
    ));
});

// Create a new category
const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    throw new ApiError(400, "Category name is required");
  }
  
  // Check if category with the same name already exists
  const existingCategory = await Category.findOne({ name });
  
  if (existingCategory) {
    throw new ApiError(409, "Category with this name already exists");
  }
  
  // Create category
  const category = await Category.create({
    name,
    description,
    createdBy: req.user._id
  });
  
  return res
    .status(201)
    .json(new apiResponse(
      201,
      category,
      "Category created successfully"
    ));
});

// Get category by ID
const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const category = await Category.findById(id);
  
  if (!category) {
    throw new ApiError(404, "Category not found");
  }
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      category,
      "Category retrieved successfully"
    ));
});

// Update category
const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive } = req.body;
  
  const category = await Category.findById(id);
  
  if (!category) {
    throw new ApiError(404, "Category not found");
  }
  
  // Check if new name already exists (if name is being updated)
  if (name && name !== category.name) {
    const existingCategory = await Category.findOne({ name });
    
    if (existingCategory) {
      throw new ApiError(409, "Category with this name already exists");
    }
  }
  
  // Update fields if provided
  if (name) category.name = name;
  if (description !== undefined) category.description = description;
  if (isActive !== undefined) category.isActive = isActive;
  
  await category.save();
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      category,
      "Category updated successfully"
    ));
});

// Delete category
const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const category = await Category.findById(id);
  
  if (!category) {
    throw new ApiError(404, "Category not found");
  }
  
  // Soft delete by setting isActive to false
  category.isActive = false;
  await category.save();
  
  return res
    .status(200)
    .json(new apiResponse(
      200,
      {},
      "Category deleted successfully"
    ));
});

export {
  getAllCategories,
  createCategory,
  getCategoryById,
  updateCategory,
  deleteCategory
};
