import mongoose from "mongoose";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

const healthCheck = asyncHandler(async (req, res) => {
  res.status(200).json(
    new ApiResponse(200, {
      message: "Server is running",
      db: mongoose.connection.readyState === 1 ? "connected" : "not connected yet",
    }),
  );
});
export { healthCheck };
