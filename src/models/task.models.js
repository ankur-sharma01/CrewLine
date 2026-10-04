import mongoose, { Schema } from "mongoose";
import { AvailableTaskStatuses, TaskStatusEnum } from "../utils/constants.js";

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: AvailableTaskStatuses, default: TaskStatusEnum.TODO },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    attachments: {
      type: [
        {
          file: { type: Schema.Types.ObjectId, ref: "File", required: true },
          name: String,
          size: Number,
          contentType: String,
          uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
          createdAt: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

export const Task = mongoose.model("Task", taskSchema);
