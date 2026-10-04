import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { serveFile } from "../controllers/upload.controller.js";

const router = Router();
router.route("/:fileId").get(verifyJWT, serveFile);

export default router;
