import mongoose from "mongoose";
import { ProjectMember } from "../models/projectmember.models.js";
import { Task } from "../models/task.models.js";
import { Comment } from "../models/comment.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { UserRolesEnum } from "../utils/constants.js";
import { logActivity } from "../utils/activity.js";
import { deleteFilesWhere } from "../utils/storage.js";

const canManageTasks = (role) => role === UserRolesEnum.ADMIN || role === UserRolesEnum.PROJECT_ADMIN;
const ASSIGNEE_FIELDS = "username fullName email avatar";
const nameOf = (u) => u?.fullName || u?.username;

// assignee has to be in the project
const assertAssigneeIsMember = async (projectId, userId) => {
  if (!userId) return;
  const member = await ProjectMember.findOne({ project: projectId, user: userId });
  if (!member) {
    throw new ApiError(400, "Assignee must be a member of this project");
  }
};

export const findTaskOr404 = async (projectId, taskId) => {
  if (!mongoose.isValidObjectId(taskId)) {
    throw new ApiError(400, "Invalid task id");
  }
  const task = await Task.findOne({ _id: taskId, project: projectId });
  if (!task) {
    throw new ApiError(404, "Task not found");
  }
  return task;
};

const getTasks = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const [tasks, counts] = await Promise.all([
    Task.find({ project: projectId }).populate("assignedTo", ASSIGNEE_FIELDS).sort({ createdAt: -1 }),
    Comment.aggregate([
      { $match: { project: new mongoose.Types.ObjectId(projectId) } },
      { $group: { _id: "$task", count: { $sum: 1 } } },
    ]),
  ]);
  const commentCounts = new Map(counts.map((c) => [String(c._id), c.count]));
  const data = tasks.map((t) => ({ ...t.toObject(), commentCount: commentCounts.get(String(t._id)) ?? 0 }));
  return res.status(200).json(new ApiResponse(200, data, "Tasks fetched successfully"));
});

const createTask = asyncHandler(async (req, res) => {
  const { title, description, status, assignedTo, dueDate } = req.body;
  const { projectId } = req.params;

  await assertAssigneeIsMember(projectId, assignedTo);

  const task = await Task.create({
    title,
    description,
    status,
    assignedTo: assignedTo || null,
    dueDate: dueDate || null,
    completedAt: status === "done" ? new Date() : null,
    project: projectId,
    createdBy: req.user._id,
  });
  await task.populate("assignedTo", ASSIGNEE_FIELDS);
  await logActivity(projectId, req.user._id, "task_created", { taskId: task._id, taskTitle: task.title });
  return res.status(201).json(new ApiResponse(201, task, "Task created successfully"));
});

const updateTask = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;
  const task = await findTaskOr404(projectId, taskId);

  const manager = canManageTasks(req.membership.role);
  const isAssignee = task.assignedTo && String(task.assignedTo) === String(req.user._id);
  const body = req.body;

  if (!manager) {
    // members can only move their own tasks
    const onlyStatus = Object.keys(body).every((key) => key === "status");
    if (!isAssignee || !onlyStatus) {
      throw new ApiError(403, "You can only change the status of tasks assigned to you");
    }
  }

  if (body.assignedTo !== undefined) await assertAssigneeIsMember(projectId, body.assignedTo);

  const before = { status: task.status, assignedTo: task.assignedTo ? String(task.assignedTo) : null };

  for (const key of ["title", "description", "status", "assignedTo", "dueDate"]) {
    if (body[key] !== undefined) task[key] = body[key] === "" ? null : body[key];
  }
  if (task.title === null) throw new ApiError(422, "Task title cannot be empty");
  if (task.status === "done" && before.status !== "done") task.completedAt = new Date();
  if (task.status !== "done" && before.status === "done") task.completedAt = null;

  await task.save();
  await task.populate("assignedTo", ASSIGNEE_FIELDS);

  if (task.status !== before.status) {
    await logActivity(projectId, req.user._id, "task_status_changed", {
      taskId: task._id,
      taskTitle: task.title,
      from: before.status,
      to: task.status,
    });
  }
  const assignedNow = task.assignedTo ? String(task.assignedTo._id) : null;
  if (assignedNow !== before.assignedTo) {
    await logActivity(projectId, req.user._id, "task_assigned", {
      taskId: task._id,
      taskTitle: task.title,
      assigneeName: nameOf(task.assignedTo) ?? null,
    });
  }

  return res.status(200).json(new ApiResponse(200, task, "Task updated successfully"));
});

const deleteTask = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;
  const task = await findTaskOr404(projectId, taskId);
  await Promise.all([task.deleteOne(), Comment.deleteMany({ task: task._id }), deleteFilesWhere({ task: task._id })]);
  await logActivity(projectId, req.user._id, "task_deleted", { taskTitle: task.title });
  return res.status(200).json(new ApiResponse(200, {}, "Task deleted successfully"));
});

// my open tasks across all projects (dashboard)
const getMyTasks = asyncHandler(async (req, res) => {
  const tasks = await Task.find({ assignedTo: req.user._id, status: { $ne: "done" } })
    .populate("project", "name")
    .sort({ dueDate: 1, createdAt: -1 })
    .limit(20);
  return res.status(200).json(new ApiResponse(200, tasks, "Your tasks fetched successfully"));
});

export { getTasks, createTask, updateTask, deleteTask, getMyTasks, canManageTasks };
