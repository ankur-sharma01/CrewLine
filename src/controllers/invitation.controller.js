import crypto from "crypto";
import mongoose from "mongoose";
import { Invitation } from "../models/invitation.models.js";
import { Project } from "../models/project.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { User } from "../models/user.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getFrontendUrl } from "../utils/auth.utils.js";
import { logActivity } from "../utils/activity.js";
import { invitationMailgenContent, sendEmail } from "../utils/mail.js";
import { UserRolesEnum } from "../utils/constants.js";

const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;
const ROLE_LABELS = { admin: "Admin", project_admin: "Project admin", member: "Member" };
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const shape = (inv) => ({
  _id: inv._id,
  email: inv.email,
  role: inv.role,
  status: inv.status,
  createdAt: inv.createdAt,
  expiresAt: inv.expiresAt,
  expired: inv.expiresAt < new Date(),
});

// "ada@gmail.com" -> "a***@gmail.com"
const maskEmail = (email) => email.replace(/^(.).*(@.*)$/, "$1***$2");

// new token + email
async function issue(req, project, invitation) {
  const token = crypto.randomBytes(32).toString("base64url");
  invitation.tokenHash = hashToken(token);
  invitation.expiresAt = new Date(Date.now() + INVITE_TTL);
  invitation.status = "pending";
  await invitation.save();

  const inviteUrl = `${getFrontendUrl(req)}/invite/${token}`;
  const inviter = req.user.fullName || req.user.username;
  const emailSent = await sendEmail({
    email: invitation.email,
    subject: `${inviter} invited you to "${project.name}"`,
    mailgenContent: invitationMailgenContent(inviter, project.name, ROLE_LABELS[invitation.role], inviteUrl),
  });
  return { inviteUrl, emailSent };
}

const findPending = async (projectId, invitationId) => {
  if (!mongoose.isValidObjectId(invitationId)) throw new ApiError(400, "Invalid invitation id");
  const invitation = await Invitation.findOne({ _id: invitationId, project: projectId, status: "pending" });
  if (!invitation) throw new ApiError(404, "Invitation not found");
  return invitation;
};

export const createInvitation = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { email, role } = req.body;

  const project = await Project.findById(projectId);
  const existingUser = await User.findOne({ email });
  if (existingUser && (await ProjectMember.exists({ project: projectId, user: existingUser._id }))) {
    throw new ApiError(409, "That person is already a member of this project");
  }

  // same email twice just refreshes the pending invite
  let invitation = await Invitation.findOne({ project: projectId, email, status: "pending" });
  if (invitation) {
    if (role) invitation.role = role;
  } else {
    invitation = new Invitation({
      project: projectId,
      email,
      role: role || UserRolesEnum.MEMBER,
      invitedBy: req.user._id,
    });
  }
  const { inviteUrl, emailSent } = await issue(req, project, invitation);

  await logActivity(projectId, req.user._id, "invitation_sent", { email, role: invitation.role });
  return res
    .status(201)
    .json(new ApiResponse(201, { invitation: shape(invitation), inviteUrl, emailSent }, "Invitation sent"));
});

export const listInvitations = asyncHandler(async (req, res) => {
  const invitations = await Invitation.find({ project: req.params.projectId, status: "pending" }).sort({
    createdAt: -1,
  });
  return res.status(200).json(new ApiResponse(200, invitations.map(shape), "Invitations fetched"));
});

export const revokeInvitation = asyncHandler(async (req, res) => {
  const invitation = await findPending(req.params.projectId, req.params.invitationId);
  invitation.status = "revoked";
  await invitation.save();
  return res.status(200).json(new ApiResponse(200, {}, "Invitation revoked"));
});

export const resendInvitation = asyncHandler(async (req, res) => {
  const invitation = await findPending(req.params.projectId, req.params.invitationId);
  const project = await Project.findById(req.params.projectId);
  const { inviteUrl, emailSent } = await issue(req, project, invitation);
  return res
    .status(200)
    .json(new ApiResponse(200, { invitation: shape(invitation), inviteUrl, emailSent }, "Invitation sent again"));
});

const findByToken = async (token) => {
  const invitation = await Invitation.findOne({
    tokenHash: hashToken(String(token)),
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
  if (!invitation) throw new ApiError(404, "This invitation is invalid or has expired");
  return invitation;
};

// public, so the invite page works before logging in
export const getInvitationByToken = asyncHandler(async (req, res) => {
  const invitation = await findByToken(req.params.token);
  const [project, inviter] = await Promise.all([
    Project.findById(invitation.project),
    User.findById(invitation.invitedBy),
  ]);
  if (!project) throw new ApiError(404, "This invitation is invalid or has expired");
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        email: invitation.email,
        role: invitation.role,
        projectName: project.name,
        invitedBy: inviter?.fullName || inviter?.username || "Someone",
      },
      "Invitation details",
    ),
  );
});

export const acceptInvitation = asyncHandler(async (req, res) => {
  const invitation = await findByToken(req.params.token);

  if (req.user.email !== invitation.email) {
    throw new ApiError(
      403,
      `This invitation was sent to ${maskEmail(invitation.email)}. Log in with that email address to accept it.`,
    );
  }

  const projectId = invitation.project;
  if (!(await ProjectMember.exists({ project: projectId, user: req.user._id }))) {
    await ProjectMember.create({ project: projectId, user: req.user._id, role: invitation.role });
    await logActivity(projectId, req.user._id, "member_joined", {
      memberName: req.user.fullName || req.user.username,
      role: invitation.role,
    });
  }
  invitation.status = "accepted";
  invitation.acceptedBy = req.user._id;
  await invitation.save();

  // they got the link by email, so the address counts as verified
  await User.updateOne(
    { _id: req.user._id },
    { $set: { isEmailVerified: true }, $unset: { emailVerificationToken: "", emailVerificationExpiry: "" } },
  );

  return res.status(200).json(new ApiResponse(200, { projectId }, "Invitation accepted"));
});
