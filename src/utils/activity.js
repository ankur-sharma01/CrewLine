import { Activity } from "../models/activity.models.js";

// awaited because serverless can freeze right after responding, but it never throws:
// the history shouldn't be able to break the real action
export const logActivity = async (project, actor, type, meta = {}) => {
  try {
    await Activity.create({ project, actor, type, meta });
  } catch (error) {
    console.error("activity log failed:", error.message);
  }
};
