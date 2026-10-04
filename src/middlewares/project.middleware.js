import mongoose from "mongoose";
import { ProjectMember } from "../models/projectmember.models.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

export const loadMembership = asyncHandler(async (req, res, next) => {
  const { projectId } = req.params;

  if (!mongoose.isValidObjectId(projectId)) {
    throw new ApiError(400, "Invalid project id");
  }

  const membership = await ProjectMember.findOne({ project: projectId, user: req.user._id });
  if (!membership) {
    throw new ApiError(404, "Project not found");
  }

  req.membership = membership;
  next();
});

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.membership.role)) {
      throw new ApiError(403, "You don't have permission to do this");
    }
    next();
  };
