import { Project } from "../models/project.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { Task } from "../models/task.models.js";
import { User } from "../models/user.models.js";
import { Comment } from "../models/comment.models.js";
import { Activity } from "../models/activity.models.js";
import { Invitation } from "../models/invitation.models.js";
import { logActivity } from "../utils/activity.js";
import { deleteFilesWhere } from "../utils/storage.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { UserRolesEnum } from "../utils/constants.js";

const getProjects = asyncHandler(async (req, res) => {
  const memberships = await ProjectMember.find({ user: req.user._id }).populate("project");
  const valid = memberships.filter((m) => m.project);
  const projectIds = valid.map((m) => m.project._id);

  const [taskAgg, memberAgg] = await Promise.all([
    Task.aggregate([
      { $match: { project: { $in: projectIds } } },
      { $group: { _id: { project: "$project", status: "$status" }, count: { $sum: 1 } } },
    ]),
    ProjectMember.aggregate([
      { $match: { project: { $in: projectIds } } },
      { $group: { _id: "$project", count: { $sum: 1 } } },
    ]),
  ]);

  const projects = valid
    .map((m) => {
      const id = String(m.project._id);
      const taskCounts = { todo: 0, in_progress: 0, done: 0 };
      taskAgg.filter((t) => String(t._id.project) === id).forEach((t) => (taskCounts[t._id.status] = t.count));
      const memberCount = memberAgg.find((x) => String(x._id) === id)?.count ?? 1;
      return {
        _id: m.project._id,
        name: m.project.name,
        description: m.project.description,
        createdAt: m.project.createdAt,
        updatedAt: m.project.updatedAt,
        myRole: m.role,
        memberCount,
        taskCounts,
      };
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return res.status(200).json(new ApiResponse(200, projects, "Projects fetched successfully"));
});

const createProject = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  const project = await Project.create({ name, description, createdBy: req.user._id });
  try {
    // creator is the admin
    await ProjectMember.create({ user: req.user._id, project: project._id, role: UserRolesEnum.ADMIN });
  } catch (error) {
    await Project.findByIdAndDelete(project._id);
    throw error;
  }

  await logActivity(project._id, req.user._id, "project_created", { projectName: project.name });

  return res.status(201).json(new ApiResponse(201, project, "Project created successfully"));
});

const getProjectById = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.projectId);
  if (!project) {
    throw new ApiError(404, "Project not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { ...project.toObject(), myRole: req.membership.role }, "Project fetched successfully"));
});

const updateProject = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description;

  const project = await Project.findByIdAndUpdate(req.params.projectId, update, {
    returnDocument: "after",
    runValidators: true,
  });
  if (!project) {
    throw new ApiError(404, "Project not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { ...project.toObject(), myRole: req.membership.role }, "Project updated successfully"));
});

const deleteProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  await Promise.all([
    Task.deleteMany({ project: projectId }),
    ProjectMember.deleteMany({ project: projectId }),
    Comment.deleteMany({ project: projectId }),
    Activity.deleteMany({ project: projectId }),
    Invitation.deleteMany({ project: projectId }),
    deleteFilesWhere({ project: projectId }),
  ]);
  await Project.findByIdAndDelete(projectId);
  return res.status(200).json(new ApiResponse(200, {}, "Project deleted successfully"));
});

const shapeMember = (m) => ({
  avatar: m.user.avatar,
  _id: m.user._id,
  username: m.user.username,
  email: m.user.email,
  fullName: m.user.fullName,
  role: m.role,
  joinedAt: m.createdAt,
});

const getMembers = asyncHandler(async (req, res) => {
  const members = await ProjectMember.find({ project: req.params.projectId })
    .populate("user", "username email fullName avatar")
    .sort({ createdAt: 1 });
  return res
    .status(200)
    .json(new ApiResponse(200, members.filter((m) => m.user).map(shapeMember), "Members fetched successfully"));
});

const addMember = asyncHandler(async (req, res) => {
  const { email, role } = req.body;
  const { projectId } = req.params;

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "No user with that email. They need to sign up first.");
  }

  const existing = await ProjectMember.findOne({ project: projectId, user: user._id });
  if (existing) {
    throw new ApiError(409, "That user is already a member of this project");
  }

  const member = await ProjectMember.create({ project: projectId, user: user._id, role: role || UserRolesEnum.MEMBER });
  await member.populate("user", "username email fullName avatar");
  await logActivity(projectId, req.user._id, "member_joined", {
    memberName: member.user.fullName || member.user.username,
    role: member.role,
  });
  return res.status(201).json(new ApiResponse(201, shapeMember(member), "Member added successfully"));
});

// there has to be at least one admin left
const isLastAdmin = async (projectId, membership) =>
  membership.role === UserRolesEnum.ADMIN &&
  (await ProjectMember.countDocuments({ project: projectId, role: UserRolesEnum.ADMIN })) <= 1;

const updateMemberRole = asyncHandler(async (req, res) => {
  const { projectId, userId } = req.params;
  const { role } = req.body;

  const member = await ProjectMember.findOne({ project: projectId, user: userId });
  if (!member) {
    throw new ApiError(404, "Member not found");
  }
  if (role !== UserRolesEnum.ADMIN && (await isLastAdmin(projectId, member))) {
    throw new ApiError(400, "A project needs at least one admin");
  }

  member.role = role;
  await member.save();
  await member.populate("user", "username email fullName avatar");
  await logActivity(projectId, req.user._id, "member_role_changed", {
    memberName: member.user.fullName || member.user.username,
    role,
  });
  return res.status(200).json(new ApiResponse(200, shapeMember(member), "Member role updated"));
});

const removeMember = asyncHandler(async (req, res) => {
  const { projectId, userId } = req.params;

  const member = await ProjectMember.findOne({ project: projectId, user: userId });
  if (!member) {
    throw new ApiError(404, "Member not found");
  }
  if (await isLastAdmin(projectId, member)) {
    throw new ApiError(400, "A project needs at least one admin");
  }

  const removedUser = await User.findById(userId).select("username fullName");
  await member.deleteOne();
  // unassign their tasks
  await Task.updateMany({ project: projectId, assignedTo: userId }, { assignedTo: null });
  await logActivity(projectId, req.user._id, "member_removed", {
    memberName: removedUser?.fullName || removedUser?.username || "a member",
  });
  return res.status(200).json(new ApiResponse(200, {}, "Member removed"));
});

export {
  getProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  getMembers,
  addMember,
  updateMemberRole,
  removeMember,
};
