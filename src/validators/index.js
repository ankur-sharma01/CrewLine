import { body, query } from "express-validator";
import { AvailableTaskStatuses, AvailableUserRole } from "../utils/constants.js";

const strongPassword = (field, label = "Password") =>
  body(field)
    .notEmpty()
    .withMessage(`${label} is required`)
    .bail()
    .isLength({ min: 8 })
    .withMessage(`${label} must be at least 8 characters`)
    .bail()
    .isLength({ max: 72 })
    .withMessage(`${label} must be at most 72 characters`);

const userRegisterValidator = () => {
  return [
    body("email")
      .trim()
      .toLowerCase()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Email is invalid"),
    body("username")
      .trim()
      .toLowerCase()
      .notEmpty()
      .withMessage("Username is required")
      .bail()
      .matches(/^[a-z0-9_]{3,20}$/)
      .withMessage("Username must be 3-20 characters: letters, numbers or underscore"),
    strongPassword("password"),
    body("fullName").optional().trim().isLength({ max: 80 }).withMessage("Name is too long"),
  ];
};

const userLoginValidator = () => {
  return [
    body("email").optional().trim().toLowerCase().isEmail().withMessage("Email is invalid"),
    body("username").optional().trim().toLowerCase(),
    body("password")
      .isString()
      .withMessage("Password is required")
      .bail()
      .notEmpty()
      .withMessage("Password is required"),
    body().custom((value) => {
      if (!value?.email && !value?.username) {
        throw new Error("Email or username is required");
      }
      return true;
    }),
  ];
};

const userChangeCurrentPasswordValidator = () => {
  return [body("oldPassword").optional().isString(), strongPassword("newPassword", "New password")];
};

const userForgotPasswordValidator = () => {
  return [
    body("email")
      .trim()
      .toLowerCase()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Email is invalid"),
  ];
};

const userResetForgotPasswordValidator = () => {
  return [strongPassword("newPassword", "New password")];
};

const createProjectValidator = () => {
  return [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Project name is required")
      .isLength({ max: 80 })
      .withMessage("Name is too long (max 80)"),
    body("description").optional().trim().isLength({ max: 500 }).withMessage("Description is too long (max 500)"),
  ];
};

const updateProjectValidator = () => {
  return [
    body("name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Project name cannot be empty")
      .isLength({ max: 80 })
      .withMessage("Name is too long (max 80)"),
    body("description").optional().trim().isLength({ max: 500 }).withMessage("Description is too long (max 500)"),
  ];
};

const addMemberValidator = () => {
  return [
    body("email")
      .trim()
      .toLowerCase()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Email is invalid"),
    body("role").optional().isIn(AvailableUserRole).withMessage("Invalid role"),
  ];
};

const updateMemberRoleValidator = () => {
  return [body("role").isIn(AvailableUserRole).withMessage("Invalid role")];
};

const createTaskValidator = () => {
  return [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Task title is required")
      .isLength({ max: 120 })
      .withMessage("Title is too long (max 120)"),
    body("description").optional().trim().isLength({ max: 1000 }).withMessage("Description is too long (max 1000)"),
    body("status").optional().isIn(AvailableTaskStatuses).withMessage("Invalid status"),
    body("assignedTo").optional({ values: "null" }).isMongoId().withMessage("Invalid assignee"),
    body("dueDate").optional({ values: "null" }).isISO8601().withMessage("Invalid due date"),
  ];
};

const updateTaskValidator = () => {
  return [
    body("title")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Task title cannot be empty")
      .isLength({ max: 120 })
      .withMessage("Title is too long (max 120)"),
    body("description").optional().trim().isLength({ max: 1000 }).withMessage("Description is too long (max 1000)"),
    body("status").optional().isIn(AvailableTaskStatuses).withMessage("Invalid status"),
    body("assignedTo").optional({ values: "null" }).isMongoId().withMessage("Invalid assignee"),
    body("dueDate").optional({ values: "null" }).isISO8601().withMessage("Invalid due date"),
  ];
};

const commentValidator = () => {
  return [
    body("body")
      .isString()
      .withMessage("Comment is required")
      .bail()
      .trim()
      .notEmpty()
      .withMessage("Comment is required")
      .isLength({ max: 2000 })
      .withMessage("Comment is too long (max 2000)"),
  ];
};

const activityQueryValidator = () => {
  return [
    query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("limit must be between 1 and 50").toInt(),
    query("before").optional().isMongoId().withMessage("Invalid cursor"),
  ];
};

export {
  commentValidator,
  activityQueryValidator,
  userRegisterValidator,
  userLoginValidator,
  userChangeCurrentPasswordValidator,
  userResetForgotPasswordValidator,
  userForgotPasswordValidator,
  createProjectValidator,
  updateProjectValidator,
  addMemberValidator,
  updateMemberRoleValidator,
  createTaskValidator,
  updateTaskValidator,
};
