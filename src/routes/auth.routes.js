import { Router } from "express";
import {
  registerUser,
  login,
  logoutUser,
  getCurrentUser,
  verifyEmail,
  resendEmailVerification,
  refreshAccessToken,
  forgotPasswordRequest,
  resetForgotPassword,
  changeCurrentPassword,
} from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  userRegisterValidator,
  userLoginValidator,
  userForgotPasswordValidator,
  userResetForgotPasswordValidator,
  userChangeCurrentPasswordValidator,
} from "../validators/index.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { limiters } from "../middlewares/rateLimit.middleware.js";
import { listProviders, oauthCallback, startOAuth } from "../controllers/oauth.controller.js";

const router = Router();

// unsecured routes
router.route("/register").post(limiters.auth, userRegisterValidator(), validate, registerUser);
router.route("/login").post(limiters.auth, limiters.loginAccount, userLoginValidator(), validate, login);
router.route("/verify-email/:verificationToken").get(verifyEmail);
router.route("/refresh-token").post(refreshAccessToken);
router.route("/forgot-password").post(limiters.auth, userForgotPasswordValidator(), validate, forgotPasswordRequest);
router
  .route("/reset-password/:resetToken")
  .post(limiters.auth, userResetForgotPasswordValidator(), validate, resetForgotPassword);

router.route("/oauth/providers").get(listProviders);
router.route("/oauth/:provider").get(startOAuth);
router.route("/oauth/:provider/callback").get(oauthCallback);

// secured routes
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/current-user").get(verifyJWT, getCurrentUser);
router.route("/change-password").post(verifyJWT, userChangeCurrentPasswordValidator(), validate, changeCurrentPassword);
router.route("/resend-email-verification").post(verifyJWT, limiters.auth, resendEmailVerification);

export default router;
