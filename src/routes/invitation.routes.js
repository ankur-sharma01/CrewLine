import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { limiters } from "../middlewares/rateLimit.middleware.js";
import { acceptInvitation, getInvitationByToken } from "../controllers/invitation.controller.js";

const router = Router();
router.route("/:token").get(limiters.auth, getInvitationByToken);
router.route("/:token/accept").post(verifyJWT, acceptInvitation);

export default router;
