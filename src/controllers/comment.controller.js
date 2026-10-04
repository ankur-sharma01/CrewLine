import mongoose from "mongoose";
import { Comment } from "../models/comment.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { logActivity } from "../utils/activity.js";
import { canManageTasks, findTaskOr404 } from "./task.controller.js";

const AUTHOR_FIELDS = "username fullName avatar";

const findComment = async (task, commentId) => {
  if (!mongoose.isValidObjectId(commentId)) throw new ApiError(400, "Invalid comment id");
  const comment = await Comment.findOne({ _id: commentId, task: task._id });
  if (!comment) throw new ApiError(404, "Comment not found");
  return comment;
};

export const getComments = asyncHandler(async (req, res) => {
  const task = await findTaskOr404(req.params.projectId, req.params.taskId);
  const comments = await Comment.find({ task: task._id }).sort({ createdAt: 1 }).populate("author", AUTHOR_FIELDS);
  return res.status(200).json(new ApiResponse(200, comments, "Comments fetched"));
});

export const addComment = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const task = await findTaskOr404(projectId, req.params.taskId);
  const comment = await Comment.create({
    task: task._id,
    project: projectId,
    author: req.user._id,
    body: req.body.body,
  });
  await comment.populate("author", AUTHOR_FIELDS);
  await logActivity(projectId, req.user._id, "comment_added", { taskId: task._id, taskTitle: task.title });
  return res.status(201).json(new ApiResponse(201, comment, "Comment added"));
});

export const updateComment = asyncHandler(async (req, res) => {
  const task = await findTaskOr404(req.params.projectId, req.params.taskId);
  const comment = await findComment(task, req.params.commentId);
  if (String(comment.author) !== String(req.user._id)) {
    throw new ApiError(403, "You can only edit your own comments");
  }
  comment.body = req.body.body;
  comment.edited = true;
  await comment.save();
  await comment.populate("author", AUTHOR_FIELDS);
  return res.status(200).json(new ApiResponse(200, comment, "Comment updated"));
});

export const deleteComment = asyncHandler(async (req, res) => {
  const task = await findTaskOr404(req.params.projectId, req.params.taskId);
  const comment = await findComment(task, req.params.commentId);
  if (String(comment.author) !== String(req.user._id) && !canManageTasks(req.membership.role)) {
    throw new ApiError(403, "You can only delete your own comments");
  }
  await comment.deleteOne();
  return res.status(200).json(new ApiResponse(200, {}, "Comment deleted"));
});
