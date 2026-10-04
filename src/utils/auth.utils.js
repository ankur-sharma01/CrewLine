import { isProduction } from "../config/env.js";
import { User } from "../models/user.models.js";
import { ApiError } from "./api-error.js";

export const cookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
});
export const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const getFrontendUrl = (req) =>
  (process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

export const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};

export const setAuthCookies = (res, accessToken, refreshToken) =>
  res
    .cookie("accessToken", accessToken, cookieOptions())
    .cookie("refreshToken", refreshToken, { ...cookieOptions(), maxAge: REFRESH_COOKIE_MAX_AGE });

export const serializeUser = (user) => {
  const u = user.toObject ? user.toObject() : user;
  return {
    _id: u._id,
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    avatar: { url: u.avatar?.url },
    isEmailVerified: u.isEmailVerified,
    createdAt: u.createdAt,
    hasPassword: Boolean(u.password),
    providers: (u.providers || []).map((p) => p.provider),
  };
};
