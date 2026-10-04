import mongoose, { Schema } from "mongoose";
import { AvailableUserRole, UserRolesEnum } from "../utils/constants.js";

const projectMemberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    role: { type: String, enum: AvailableUserRole, default: UserRolesEnum.MEMBER },
  },
  { timestamps: true },
);

// one membership per user per project
projectMemberSchema.index({ user: 1, project: 1 }, { unique: true });

export const ProjectMember = mongoose.model("ProjectMember", projectMemberSchema);
