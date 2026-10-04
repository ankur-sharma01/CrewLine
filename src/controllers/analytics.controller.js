import { ProjectMember } from "../models/projectmember.models.js";
import { Task } from "../models/task.models.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 8;

// monday 00:00 UTC of that week
const weekStart = (date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY);
};
const isoDay = (date) => date.toISOString().slice(0, 10);

export const getProjectAnalytics = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const [tasks, members] = await Promise.all([
    Task.find({ project: projectId }).select("status dueDate assignedTo createdAt completedAt updatedAt"),
    ProjectMember.find({ project: projectId }).populate("user", "username fullName avatar"),
  ]);

  const now = new Date();
  const today = isoDay(now);
  const inAWeek = isoDay(new Date(now.getTime() + 7 * DAY));
  const open = tasks.filter((t) => t.status !== "done");

  const count = (status) => tasks.filter((t) => t.status === status).length;
  const totals = {
    total: tasks.length,
    todo: count("todo"),
    in_progress: count("in_progress"),
    done: count("done"),
    overdue: open.filter((t) => t.dueDate && isoDay(t.dueDate) < today).length,
    dueSoon: open.filter((t) => t.dueDate && isoDay(t.dueDate) >= today && isoDay(t.dueDate) <= inAWeek).length,
  };
  totals.completionRate = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  // average days from created to done
  const cycles = tasks
    .filter((t) => t.status === "done")
    .map((t) => ((t.completedAt ?? t.updatedAt) - t.createdAt) / DAY);
  const avgCycleDays = cycles.length ? Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10 : null;

  // created vs completed over the last 8 weeks
  const firstWeek = new Date(weekStart(now).getTime() - (WEEKS - 1) * 7 * DAY);
  const weekly = Array.from({ length: WEEKS }, (_, i) => ({
    weekStart: isoDay(new Date(firstWeek.getTime() + i * 7 * DAY)),
    created: 0,
    completed: 0,
  }));
  const bucket = (date) => Math.floor((weekStart(date).getTime() - firstWeek.getTime()) / (7 * DAY));
  for (const t of tasks) {
    const created = bucket(t.createdAt);
    if (created >= 0 && created < WEEKS) weekly[created].created++;
    if (t.status === "done") {
      const done = bucket(t.completedAt ?? t.updatedAt);
      if (done >= 0 && done < WEEKS) weekly[done].completed++;
    }
  }

  // tasks per person, including people with nothing assigned
  const empty = () => ({ todo: 0, in_progress: 0, done: 0 });
  const byUser = new Map(
    members
      .filter((m) => m.user)
      .map((m) => [
        String(m.user._id),
        { userId: m.user._id, name: m.user.fullName || m.user.username, avatar: m.user.avatar, ...empty() },
      ]),
  );
  const unassigned = empty();
  for (const t of tasks) {
    const row = t.assignedTo ? byUser.get(String(t.assignedTo)) : null;
    (row ?? unassigned)[t.status]++;
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { totals, avgCycleDays, weekly, workload: [...byUser.values()], unassigned },
        "Analytics fetched",
      ),
    );
});
