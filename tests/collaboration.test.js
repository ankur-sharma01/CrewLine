import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Comment } from "../src/models/comment.models.js";
import { API, clearDb, closeDb, makeProject, newTask, signup } from "./helpers.js";

beforeEach(clearDb);
afterAll(closeDb);

async function setup() {
  const [ada, bob, cy, outsider] = [await signup(), await signup(), await signup(), await signup()];
  const project = await makeProject(ada, [
    { ...bob, role: "member" },
    { ...cy, role: "project_admin" },
  ]);
  const task = await newTask(ada, project._id, { title: "Ship it" });
  const base = `${API}/projects/${project._id}/tasks/${task._id}/comments`;
  return { ada, bob, cy, outsider, project, task, base };
}

describe("comments", () => {
  it("every member can comment; comments come back oldest first with authors", async () => {
    const { ada, bob, base } = await setup();
    expect((await bob.agent.post(base).send({ body: "  first!  " })).body.data.body).toBe("first!");
    await ada.agent.post(base).send({ body: "second" }).expect(201);
    const list = (await bob.agent.get(base)).body.data;
    expect(list.map((c) => c.body)).toEqual(["first!", "second"]);
    expect(list[0].author.username).toBe(bob.user.username);
  });

  it("validates, and keeps outsiders out", async () => {
    const { ada, outsider, base } = await setup();
    expect((await ada.agent.post(base).send({ body: "   " })).status).toBe(422);
    expect((await ada.agent.post(base).send({ body: "x".repeat(2001) })).status).toBe(422);
    expect((await ada.agent.post(base).send({ body: { $ne: 1 } })).status).toBe(400);
    expect((await outsider.agent.get(base)).status).toBe(404);
    expect((await outsider.agent.post(base).send({ body: "hi" })).status).toBe(404);
  });

  it("edit = author only; delete = author or a project admin", async () => {
    const { ada, bob, cy, base } = await setup();
    const id = (await bob.agent.post(base).send({ body: "mine" })).body.data._id;
    expect((await ada.agent.patch(`${base}/${id}`).send({ body: "edited by admin" })).status).toBe(403);
    const edited = await bob.agent.patch(`${base}/${id}`).send({ body: "edited" });
    expect(edited.body.data).toMatchObject({ body: "edited", edited: true });

    const otherId = (await ada.agent.post(base).send({ body: "ada's" })).body.data._id;
    expect((await bob.agent.delete(`${base}/${otherId}`)).status).toBe(403);
    expect((await cy.agent.delete(`${base}/${otherId}`)).status).toBe(200); // project admin moderates
    expect((await bob.agent.delete(`${base}/${id}`)).status).toBe(200);
  });

  it("tasks report a comment count, and deleting a task deletes its comments", async () => {
    const { ada, bob, project, task, base } = await setup();
    await bob.agent.post(base).send({ body: "one" });
    await bob.agent.post(base).send({ body: "two" });
    const tasks = (await ada.agent.get(`${API}/projects/${project._id}/tasks`)).body.data;
    expect(tasks[0].commentCount).toBe(2);
    await ada.agent.delete(`${API}/projects/${project._id}/tasks/${task._id}`).expect(200);
    expect(await Comment.countDocuments()).toBe(0);
  });
});

describe("activity feed", () => {
  it("records what happened, newest first, with the actor", async () => {
    const { ada, bob, project, task } = await setup();
    const url = `${API}/projects/${project._id}`;
    await ada.agent.patch(`${url}/tasks/${task._id}`).send({ assignedTo: bob.user._id, status: "in_progress" });
    await bob.agent.post(`${url}/tasks/${task._id}/comments`).send({ body: "on it" });

    const { items } = (await bob.agent.get(`${url}/activity`)).body.data;
    const types = items.map((i) => i.type);
    expect(types[0]).toBe("comment_added");
    expect(types).toEqual(
      expect.arrayContaining([
        "project_created",
        "member_joined",
        "task_created",
        "task_status_changed",
        "task_assigned",
      ]),
    );
    expect(items[0].actor.username).toBe(bob.user.username);
    const moved = items.find((i) => i.type === "task_status_changed");
    expect(moved.meta).toMatchObject({ taskTitle: "Ship it", from: "todo", to: "in_progress" });
  });

  it("pages with a cursor and is private to the project", async () => {
    const { ada, outsider, project } = await setup();
    const url = `${API}/projects/${project._id}/activity`;
    const first = (await ada.agent.get(`${url}?limit=2`)).body.data;
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = (await ada.agent.get(`${url}?limit=2&before=${first.nextCursor}`)).body.data;
    expect(second.items[0]._id).not.toBe(first.items[0]._id);
    const ids = [...first.items, ...second.items].map((i) => i._id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((await ada.agent.get(`${url}?limit=500`)).status).toBe(422);
    expect((await outsider.agent.get(url)).status).toBe(404);
  });
});

describe("analytics", () => {
  it("computes totals, overdue, workload (including idle members) and weekly throughput", async () => {
    const { ada, bob, project } = await setup();
    const url = `${API}/projects/${project._id}`;
    const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    await newTask(ada, project._id, { title: "late", assignedTo: bob.user._id, dueDate: past, status: "in_progress" });
    await newTask(ada, project._id, { title: "done", assignedTo: bob.user._id, status: "done" });
    await newTask(ada, project._id, { title: "unassigned" });

    const a = (await bob.agent.get(`${url}/analytics`)).body.data;
    expect(a.totals).toMatchObject({ total: 4, todo: 2, in_progress: 1, done: 1, overdue: 1, completionRate: 25 });
    expect(a.avgCycleDays).not.toBeNull();
    expect(a.weekly).toHaveLength(8);
    expect(a.weekly.at(-1)).toMatchObject({ created: 4, completed: 1 });
    expect(a.workload).toHaveLength(3); // ada, bob and cy - cy has nothing yet
    expect(a.workload.find((w) => w.userId === bob.user._id)).toMatchObject({ in_progress: 1, done: 1 });
    expect(a.unassigned.todo).toBe(2);
  });

  it("is private to the project", async () => {
    const { outsider, project } = await setup();
    expect((await outsider.agent.get(`${API}/projects/${project._id}/analytics`)).status).toBe(404);
  });
});
