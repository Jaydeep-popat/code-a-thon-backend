import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const restrictTo = (allowedRoles) => {
  return asyncHandler(async (req, res, next) => {
    const userRole = req.user?.role;

    if (!userRole) {
      throw new ApiError(401, "You need to be logged in to access this resource");
    }

    if (!allowedRoles.includes(userRole)) {
      throw new ApiError(403, "You don't have permission to perform this action");
    }

    next();
  });
};
