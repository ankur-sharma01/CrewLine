import mongoose from "mongoose";
import { isProduction } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

export const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let error = err;

  if (!(error instanceof ApiError)) {
    if (error instanceof mongoose.Error.ValidationError) {
      const details = Object.values(error.errors).map((e) => ({ [e.path]: e.message }));
      error = new ApiError(422, "Received data is not valid", details);
    } else if (error instanceof mongoose.Error.CastError) {
      error = new ApiError(400, `Invalid ${error.path}`);
    } else if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "value";
      error = new ApiError(409, `That ${field} is already in use`);
    } else if (error?.type === "entity.parse.failed") {
      error = new ApiError(400, "Request body is not valid JSON");
    } else if (error?.type === "entity.too.large") {
      error = new ApiError(413, "Request body is too large");
    } else {
      console.error(err);
      error = new ApiError(500, "Something went wrong");
    }
  }

  const body = {
    statusCode: error.statusCode,
    data: null,
    message: error.message,
    success: false,
    errors: error.errors,
  };
  if (!isProduction && error.statusCode === 500) {
    body.stack = err.stack;
  }

  res.status(error.statusCode).json(body);
};
