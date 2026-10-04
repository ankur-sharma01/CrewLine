import { ApiError } from "../utils/api-error.js";

const hasOperatorKeys = (value, depth = 0) =>
  Boolean(value) &&
  typeof value === "object" &&
  Object.entries(value).some(
    ([key, inner]) => key.startsWith("$") || key.includes(".") || (depth < 6 && hasOperatorKeys(inner, depth + 1)),
  );

export const rejectOperatorKeys = (req, res, next) => {
  if (hasOperatorKeys(req.body)) {
    throw new ApiError(400, "Request contains invalid field names");
  }
  next();
};

export const originGuard = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const origin = req.get("origin");
  if (!origin) return next();

  const allowed = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  let sameHost = false;
  try {
    sameHost = new URL(origin).host === req.get("host");
  } catch {
    // bad Origin header, treat as foreign
  }
  let own = null;
  try {
    own = process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin : null;
  } catch {
    // bad FRONTEND_URL, ignore it
  }
  if (sameHost || origin === own || allowed.includes(origin)) return next();

  throw new ApiError(403, "Cross-origin request blocked");
};
