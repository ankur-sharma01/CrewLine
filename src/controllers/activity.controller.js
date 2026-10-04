import { Activity } from "../models/activity.models.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

export const getActivity = asyncHandler(async (req, res) => {
  const limit = req.query.limit || 30;
  const filter = { project: req.params.projectId };
  if (req.query.before) filter._id = { $lt: req.query.before };

  const rows = await Activity.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate("actor", "username fullName avatar");

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return res
    .status(200)
    .json(new ApiResponse(200, { items, nextCursor: hasMore ? items.at(-1)._id : null }, "Activity fetched"));
});
