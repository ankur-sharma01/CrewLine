import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { API, anon, clearDb, closeDb, makeProject, newTask, signup } from "./helpers.js";

beforeEach(clearDb);
afterAll(closeDb);

describe("projects and roles", () => {
  it("creator becomes admin; outsiders can't see the project (404, not 403)", async () => {
    const [ada, bob] = [await signup(), await signup()];
    const project = await makeProject(ada);
    const list = (await ada.agent.get(`${API}/projects`)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      myRole: "admin",
      memberCount: 1,
      taskCounts: { todo: 0, in_progress: 0, done: 0 },
    });
    expect((await bob.agent.get(`${API}/projects`)).body.data).toHaveLength(0);
    expect((await bob.agent.get(`${API}/projects/${project._id}`)).status).toBe(404);
    expect((await bob.agent.get(`${API}/projects/${project._id}/tasks`)).status).toBe(404);
    expect((await ada.agent.get(`${API}/projects/not-an-id`)).status).toBe(400);
    expect((await anon().get(`${API}/projects`)).status).toBe(401);
  });

  it("validates project input", async () => {
    const ada = await signup();
    expect((await ada.agent.post(`${API}/projects`).send({ name: "" })).status).toBe(422);
    expect((await ada.agent.post(`${API}/projects`).send({ name: "x".repeat(81) })).status).toBe(422);
  });

  it("members can't manage the project, admins can", async () => {
    const [ada, bob] = [await signup(), await signup()];
    const project = await makeProject(ada, [{ ...bob, role: "member" }]);
    const base = `${API}/projects/${project._id}`;
    expect((await bob.agent.get(base)).body.data.myRole).toBe("member");
    expect((await bob.agent.get(`${base}/members`)).body.data).toHaveLength(2);
    expect((await bob.agent.post(`${base}/members`).send({ email: ada.user.email })).status).toBe(403);
    expect((await bob.agent.patch(base).send({ name: "Hacked" })).status).toBe(403);
    expect((await bob.agent.delete(base)).status).toBe(403);
    expect((await bob.agent.post(`${base}/tasks`).send({ title: "x" })).status).toBe(403);
    expect((await ada.agent.patch(base).send({ name: "Renamed" })).body.data.name).toBe("Renamed");
  });

  it("members: unknown email 404, duplicate 409, can't demote or remove the last admin", async () => {
    const [ada, bob] = [await signup(), await signup()];
    const project = await makeProject(ada);
    const base = `${API}/projects/${project._id}`;
    expect((await ada.agent.post(`${base}/members`).send({ email: "ghost@test.dev" })).status).toBe(404);
    const added = await ada.agent.post(`${base}/members`).send({ email: bob.user.email, role: "member" });
    expect(added.status).toBe(201);
    expect((await ada.agent.post(`${base}/members`).send({ email: bob.user.email })).status).toBe(409);
    expect((await ada.agent.patch(`${base}/members/${ada.user._id}`).send({ role: "member" })).status).toBe(400);
    expect((await ada.agent.delete(`${base}/members/${ada.user._id}`)).status).toBe(400);
    expect(
      (await ada.agent.patch(`${base}/members/${bob.user._id}`).send({ role: "project_admin" })).body.data.role,
    ).toBe("project_admin");
    expect((await bob.agent.patch(`${base}/members/${bob.user._id}`).send({ role: "admin" })).status).toBe(403);
  });

  it("removing a member unassigns their tasks and revokes access", async () => {
    const [ada, bob] = [await signup(), await signup()];
    const project = await makeProject(ada, [{ ...bob, role: "member" }]);
    await newTask(ada, project._id, { assignedTo: bob.user._id });
    await ada.agent.delete(`${API}/projects/${project._id}/members/${bob.user._id}`).expect(200);
    const tasks = (await ada.agent.get(`${API}/projects/${project._id}/tasks`)).body.data;
    expect(tasks[0].assignedTo).toBeNull();
    expect((await bob.agent.get(`${API}/projects/${project._id}`)).status).toBe(404);
  });

  it("deleting a project removes it from the list", async () => {
    const ada = await signup();
    const project = await makeProject(ada);
    await ada.agent.delete(`${API}/projects/${project._id}`).expect(200);
    expect((await ada.agent.get(`${API}/projects`)).body.data).toHaveLength(0);
  });
});

describe("tasks", () => {
  it("admins create + assign; assignees may only move their own task", async () => {
    const [ada, bob, cy] = [await signup(), await signup(), await signup()];
    const project = await makeProject(ada, [
      { ...bob, role: "member" },
      { ...cy, role: "member" },
    ]);
    const base = `${API}/projects/${project._id}/tasks`;

    expect((await ada.agent.post(base).send({ title: "" })).status).toBe(422);
    expect((await ada.agent.post(base).send({ title: "x", assignedTo: "64b7f0000000000000000000" })).status).toBe(400);

    const mine = await newTask(ada, project._id, { title: "Design", assignedTo: bob.user._id, dueDate: "2026-12-01" });
    const other = await newTask(ada, project._id, { title: "Other", assignedTo: cy.user._id });
    expect(mine).toMatchObject({ status: "todo" });
    expect(mine.assignedTo.username).toBe(bob.user.username);

    expect((await bob.agent.patch(`${base}/${mine._id}`).send({ status: "in_progress" })).body.data.status).toBe(
      "in_progress",
    );
    expect((await bob.agent.patch(`${base}/${mine._id}`).send({ title: "renamed" })).status).toBe(403);
    expect((await bob.agent.patch(`${base}/${other._id}`).send({ status: "done" })).status).toBe(403);
    expect((await bob.agent.delete(`${base}/${mine._id}`)).status).toBe(403);
    expect((await ada.agent.patch(`${base}/${mine._id}`).send({ status: "invalid" })).status).toBe(422);
    const edited = await ada.agent.patch(`${base}/${mine._id}`).send({ title: "Design v2", dueDate: null });
    expect(edited.body.data).toMatchObject({ title: "Design v2", dueDate: null });
  });

  it("project admins can create tasks; GET /tasks/mine lists my open tasks with the project name", async () => {
    const [ada, bob] = [await signup(), await signup()];
    const project = await makeProject(ada, [{ ...bob, role: "project_admin" }], "Website");
    await newTask(bob, project._id, { title: "By bob", assignedTo: bob.user._id });
    await newTask(bob, project._id, { title: "Done one", assignedTo: bob.user._id, status: "done" });
    const mine = (await bob.agent.get(`${API}/tasks/mine`)).body.data;
    expect(mine).toHaveLength(1);
    expect(mine[0].project.name).toBe("Website");
  });

  it("stamps completedAt when a task is done and clears it when reopened", async () => {
    const ada = await signup();
    const project = await makeProject(ada);
    const task = await newTask(ada, project._id);
    const url = `${API}/projects/${project._id}/tasks/${task._id}`;
    expect((await ada.agent.patch(url).send({ status: "done" })).body.data.completedAt).toBeTruthy();
    expect((await ada.agent.patch(url).send({ status: "todo" })).body.data.completedAt).toBeNull();
  });
});
