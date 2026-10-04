import mongoose, { Schema } from "mongoose";

export const ACTIVITY_TYPES = [
  "project_created",
  "project_updated",
  "task_created",
  "task_status_changed",
  "task_assigned",
  "task_deleted",
  "comment_added",
  "attachment_added",
  "member_joined",
  "member_role_changed",
  "member_removed",
  "invitation_sent",
];

const activitySchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// newest first per project
activitySchema.index({ project: 1, _id: -1 });

export const Activity = mongoose.model("Activity", activitySchema);
