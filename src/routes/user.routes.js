import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { limiters } from "../middlewares/rateLimit.middleware.js";
import { receiveAvatar, removeAvatar, setAvatar } from "../controllers/upload.controller.js";

const router = Router();
router.use(verifyJWT);
router.route("/me/avatar").put(limiters.upload, receiveAvatar, setAvatar).delete(removeAvatar);

export default router;
