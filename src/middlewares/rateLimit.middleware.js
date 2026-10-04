import crypto from "crypto";
import { RateLimit } from "../models/ratelimit.models.js";
import { ApiError } from "../utils/api-error.js";

// fixed window counter
const hit = async (id, windowMs) => {
  const now = new Date();
  // window still open, add one
  let doc = await RateLimit.findOneAndUpdate(
    { _id: id, resetAt: { $gt: now } },
    { $inc: { count: 1 } },
    { returnDocument: "after" },
  );
  if (doc) return doc;
  // no window or it expired, start a new one
  try {
    return await RateLimit.findOneAndUpdate(
      { _id: id },
      { $set: { count: 1, resetAt: new Date(now.getTime() + windowMs) } },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    // two requests created it at the same time, count on the winner's window
    if (error?.code === 11000) {
      return RateLimit.findOneAndUpdate({ _id: id }, { $inc: { count: 1 } }, { returnDocument: "after" });
    }
    throw error;
  }
};

export const rateLimit =
  ({
    name,
    windowMs,
    max,
    key = (req) => req.ip,
    message = "Too many requests. Please slow down and try again later.",
  }) =>
  async (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === "true") return next();

    try {
      // hash the key so no emails or IPs get stored
      const id = `${name}:${crypto
        .createHash("sha256")
        .update(String(key(req)))
        .digest("hex")
        .slice(0, 32)}`;
      const doc = await hit(id, windowMs);
      const secondsLeft = Math.max(1, Math.ceil((doc.resetAt.getTime() - Date.now()) / 1000));

      res.set({
        "RateLimit-Limit": String(max),
        "RateLimit-Remaining": String(Math.max(0, max - doc.count)),
        "RateLimit-Reset": String(secondsLeft),
      });
      if (doc.count > max) {
        res.set("Retry-After", String(secondsLeft));
        return next(new ApiError(429, message));
      }
      return next();
    } catch (error) {
      // fail open: if the store hiccups, better to serve the request than lock everyone out
      console.error("rate limiter error:", error.message);
      return next();
    }
  };

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const identifier = (req) =>
  String(req.body?.email || req.body?.username || "")
    .toLowerCase()
    .slice(0, 100);

export const limiters = {
  // overall limit per IP
  global: rateLimit({ name: "global", windowMs: FIFTEEN_MIN, max: 600 }),
  // login, register and password emails, per IP
  auth: rateLimit({
    name: "auth",
    windowMs: FIFTEEN_MIN,
    max: 20,
    message: "Too many attempts from this network. Please wait a few minutes and try again.",
  }),
  // per account, so one account can't be guessed from lots of IPs
  loginAccount: rateLimit({
    name: "login-account",
    windowMs: FIFTEEN_MIN,
    max: 8,
    key: identifier,
    message: "Too many failed logins for this account. Please wait a few minutes and try again.",
  }),
  // per user
  invite: rateLimit({
    name: "invite",
    windowMs: ONE_HOUR,
    max: 20,
    key: (req) => req.user._id,
    message: "Too many invitations sent. Try again later.",
  }),
  upload: rateLimit({
    name: "upload",
    windowMs: ONE_HOUR,
    max: 40,
    key: (req) => req.user._id,
    message: "Too many uploads. Try again later.",
  }),
};
