import multer from "multer";
import { DEFAULT_AVATAR_URL, User } from "../models/user.models.js";
import { File } from "../models/file.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import mongoose from "mongoose";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { serializeUser } from "../utils/auth.utils.js";
import { logActivity } from "../utils/activity.js";
import { ATTACHMENT_TYPES, IMAGE_TYPES, detectType, safeFilename } from "../utils/filetype.js";
import { deleteFile, readFile, saveFile } from "../utils/storage.js";
import { canManageTasks, findTaskOr404 } from "./task.controller.js";

const AVATAR_MAX = 512 * 1024;
const ATTACHMENT_MAX = 2 * 1024 * 1024; // Vercel functions accept request bodies up to 4.5 MB in total
const MAX_ATTACHMENTS_PER_TASK = 5;
const OWN_FILE_URL = /^\/api\/v1\/files\/([a-f0-9]{24})$/;

// multer keeps the upload in memory, wrapped so its errors look like normal api errors
const receive = (field, maxBytes, maxLabel) => {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } }).single(field);
  return (req, res, next) =>
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") return next(new ApiError(413, `File is too large (max ${maxLabel})`));
      return next(err.name === "MulterError" ? new ApiError(400, err.message) : err);
    });
};
export const receiveAvatar = receive("avatar", AVATAR_MAX, "512 KB");
export const receiveAttachment = receive("file", ATTACHMENT_MAX, "2 MB");

export const setAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "No image received (form field name: avatar)");
  const type = detectType(req.file.buffer);
  if (!IMAGE_TYPES.includes(type)) throw new ApiError(415, "The avatar must be a JPEG, PNG, GIF or WebP image");

  const file = await saveFile({
    kind: "avatar",
    name: safeFilename(req.file.originalname),
    contentType: type,
    buffer: req.file.buffer,
    owner: req.user._id,
  });

  const user = await User.findById(req.user._id).select("+password");
  const previous = user.avatar?.url?.match(OWN_FILE_URL)?.[1];
  user.avatar = { url: `/api/v1/files/${file._id}`, localPath: "" };
  await user.save({ validateBeforeSave: false });
  if (previous) await deleteFile(previous);

  return res.status(200).json(new ApiResponse(200, serializeUser(user), "Avatar updated"));
});

export const removeAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+password");
  const previous = user.avatar?.url?.match(OWN_FILE_URL)?.[1];
  user.avatar = { url: DEFAULT_AVATAR_URL, localPath: "" };
  await user.save({ validateBeforeSave: false });
  if (previous) await deleteFile(previous);
  return res.status(200).json(new ApiResponse(200, serializeUser(user), "Avatar removed"));
});

export const addAttachment = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;
  const task = await findTaskOr404(projectId, taskId);
  if (!req.file) throw new ApiError(400, "No file received (form field name: file)");
  if (task.attachments.length >= MAX_ATTACHMENTS_PER_TASK) {
    throw new ApiError(400, `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} attachments`);
  }
  const type = detectType(req.file.buffer);
  if (!ATTACHMENT_TYPES.includes(type)) throw new ApiError(415, "Allowed files: images, PDF and plain text");

  const name = safeFilename(req.file.originalname);
  const file = await saveFile({
    kind: "attachment",
    name,
    contentType: type,
    buffer: req.file.buffer,
    owner: req.user._id,
    project: projectId,
    task: task._id,
  });
  task.attachments.push({ file: file._id, name, size: file.size, contentType: type, uploadedBy: req.user._id });
  await task.save();

  await logActivity(projectId, req.user._id, "attachment_added", {
    taskId: task._id,
    taskTitle: task.title,
    fileName: name,
  });
  return res.status(201).json(new ApiResponse(201, task.attachments.at(-1), "File attached"));
});

export const removeAttachment = asyncHandler(async (req, res) => {
  const { projectId, taskId, fileId } = req.params;
  const task = await findTaskOr404(projectId, taskId);
  const attachment = task.attachments.find((a) => String(a.file) === fileId);
  if (!attachment) throw new ApiError(404, "Attachment not found");
  if (String(attachment.uploadedBy) !== String(req.user._id) && !canManageTasks(req.membership.role)) {
    throw new ApiError(403, "You can only remove your own attachments");
  }
  task.attachments = task.attachments.filter((a) => String(a.file) !== fileId);
  await task.save();
  await deleteFile(fileId);
  return res.status(200).json(new ApiResponse(200, {}, "Attachment removed"));
});

export const serveFile = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  if (!mongoose.isValidObjectId(fileId)) throw new ApiError(400, "Invalid file id");
  const file = await readFile(fileId);
  if (!file) throw new ApiError(404, "File not found");

  if (file.kind === "attachment" && !(await ProjectMember.exists({ project: file.project, user: req.user._id }))) {
    throw new ApiError(404, "File not found");
  }

  const isImage = IMAGE_TYPES.includes(file.contentType);
  if (isImage) {
    res.set("Content-Disposition", "inline");
  } else {
    res.attachment(file.name); // forces a download instead of rendering it in the browser
  }
  res.set({
    "Content-Type": file.contentType,
    "Content-Length": String(file.data.length),
    // never let the browser run anything from an upload
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": file.kind === "avatar" ? "private, max-age=31536000, immutable" : "private, max-age=3600",
  });
  return res.send(file.data);
});
