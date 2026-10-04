import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { loadMembership, requireRole } from "../middlewares/project.middleware.js";
import { limiters } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import { UserRolesEnum } from "../utils/constants.js";
import {
  createProjectValidator,
  updateProjectValidator,
  addMemberValidator,
  updateMemberRoleValidator,
  createTaskValidator,
  updateTaskValidator,
  commentValidator,
  activityQueryValidator,
} from "../validators/index.js";
import {
  getProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  getMembers,
  addMember,
  updateMemberRole,
  removeMember,
} from "../controllers/project.controller.js";
import { getTasks, createTask, updateTask, deleteTask } from "../controllers/task.controller.js";
import { addComment, deleteComment, getComments, updateComment } from "../controllers/comment.controller.js";
import {
  createInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
} from "../controllers/invitation.controller.js";
import { getActivity } from "../controllers/activity.controller.js";
import { getProjectAnalytics } from "../controllers/analytics.controller.js";
import { addAttachment, receiveAttachment, removeAttachment } from "../controllers/upload.controller.js";

const { ADMIN, PROJECT_ADMIN } = UserRolesEnum;
const router = Router();

router.use(verifyJWT);

router.route("/").get(getProjects).post(createProjectValidator(), validate, createProject);

router
  .route("/:projectId")
  .all(loadMembership)
  .get(getProjectById)
  .patch(requireRole(ADMIN), updateProjectValidator(), validate, updateProject)
  .delete(requireRole(ADMIN), deleteProject);

// members
router
  .route("/:projectId/members")
  .all(loadMembership)
  .get(getMembers)
  .post(requireRole(ADMIN), addMemberValidator(), validate, addMember);

router
  .route("/:projectId/members/:userId")
  .all(loadMembership, requireRole(ADMIN))
  .patch(updateMemberRoleValidator(), validate, updateMemberRole)
  .delete(removeMember);

// invitations, admin only
router
  .route("/:projectId/invitations")
  .all(loadMembership, requireRole(ADMIN))
  .get(listInvitations)
  .post(limiters.invite, addMemberValidator(), validate, createInvitation);
router.route("/:projectId/invitations/:invitationId").all(loadMembership, requireRole(ADMIN)).delete(revokeInvitation);
router
  .route("/:projectId/invitations/:invitationId/resend")
  .all(loadMembership, requireRole(ADMIN))
  .post(limiters.invite, resendInvitation);

// tasks
router
  .route("/:projectId/tasks")
  .all(loadMembership)
  .get(getTasks)
  .post(requireRole(ADMIN, PROJECT_ADMIN), createTaskValidator(), validate, createTask);

router
  .route("/:projectId/tasks/:taskId")
  .all(loadMembership)
  .patch(updateTaskValidator(), validate, updateTask)
  .delete(requireRole(ADMIN, PROJECT_ADMIN), deleteTask);

// comments
router
  .route("/:projectId/tasks/:taskId/comments")
  .all(loadMembership)
  .get(getComments)
  .post(commentValidator(), validate, addComment);
router
  .route("/:projectId/tasks/:taskId/comments/:commentId")
  .all(loadMembership)
  .patch(commentValidator(), validate, updateComment)
  .delete(deleteComment);

// attachments, uploader or a project admin can remove
router
  .route("/:projectId/tasks/:taskId/attachments")
  .all(loadMembership)
  .post(limiters.upload, receiveAttachment, addAttachment);
router.route("/:projectId/tasks/:taskId/attachments/:fileId").all(loadMembership).delete(removeAttachment);

// activity and analytics
router.route("/:projectId/activity").all(loadMembership).get(activityQueryValidator(), validate, getActivity);
router.route("/:projectId/analytics").all(loadMembership).get(getProjectAnalytics);

export default router;
