import mongoose, { Schema } from "mongoose";

const commentSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    edited: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Comment = mongoose.model("Comment", commentSchema);
