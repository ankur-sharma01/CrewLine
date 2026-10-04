import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { getMyTasks } from "../controllers/task.controller.js";

const router = Router();
router.route("/mine").get(verifyJWT, getMyTasks);
export default router;
