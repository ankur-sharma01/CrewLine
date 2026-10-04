import "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import connectDB from "./db/index.js";
import { ApiError } from "./utils/api-error.js";
import { errorHandler, notFound } from "./middlewares/error.middleware.js";

import healthCheckRouter from "./routes/healthcheck.routes.js";
import authRouter from "./routes/auth.routes.js";
import projectRouter from "./routes/project.routes.js";
import taskRouter from "./routes/task.routes.js";
import invitationRouter from "./routes/invitation.routes.js";
import userRouter from "./routes/user.routes.js";
import fileRouter from "./routes/file.routes.js";
import { originGuard, rejectOperatorKeys } from "./middlewares/security.middleware.js";
import { limiters } from "./middlewares/rateLimit.middleware.js";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());

// basic configurations:
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public")); // public can be accessed

app.use(cookieParser());

// cors configurations:
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use("/api/v1/healthCheck", healthCheckRouter);

app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    next(new ApiError(503, "Database unavailable, please try again shortly"));
  }
});

app.use("/api", originGuard, limiters.global, rejectOperatorKeys);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/projects", projectRouter);
app.use("/api/v1/tasks", taskRouter);
app.use("/api/v1/invitations", invitationRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/files", fileRouter);

app.get("/", (req, res) => {
  res.send("Welcome to BaseCampy");
});

app.use(notFound);
app.use(errorHandler);

export default app;
