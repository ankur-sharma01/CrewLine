import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { File } from "../src/models/file.models.js";
import { API, anon, clearDb, closeDb, makeProject, newTask, signup } from "./helpers.js";

beforeEach(clearDb);
afterAll(closeDb);

// files are detected by their first bytes, so these are just the magic numbers plus padding
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const TEXT = Buffer.from("name,role\nada,admin\n");
const HTML = Buffer.from("<html><script>alert(1)</script></html>");
const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const putAvatar = (agent, buf, filename = "me.png", contentType = "image/png") =>
  agent.put(`${API}/users/me/avatar`).attach("avatar", buf, { filename, contentType });

describe("avatars", () => {
  it("uploads, serves and replaces an avatar (the old file is deleted)", async () => {
    const [ada, bob] = [await signup(), await signup()];
    const res = await putAvatar(ada.agent, PNG);
    expect(res.status).toBe(200);
    const url = res.body.data.avatar.url;
    expect(url).toMatch(/^\/api\/v1\/files\/[a-f0-9]{24}$/);

    const file = await bob.agent.get(url); // teammates can see it
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.headers["content-disposition"]).toBe("inline");
    expect(file.headers["content-security-policy"]).toContain("sandbox");
    expect(Buffer.compare(file.body, PNG)).toBe(0);
    expect((await anon().get(url)).status).toBe(401);

    await putAvatar(ada.agent, PNG);
    expect(await File.countDocuments({ kind: "avatar" })).toBe(1);
    expect((await ada.agent.get(url)).status).toBe(404);
  });

  it("can be removed, restoring the placeholder", async () => {
    const ada = await signup();
    await putAvatar(ada.agent, PNG);
    const res = await ada.agent.delete(`${API}/users/me/avatar`);
    expect(res.body.data.avatar.url).toContain("placehold.co");
    expect(await File.countDocuments()).toBe(0);
  });

  it("checks the REAL type, not the name or declared type", async () => {
    const ada = await signup();
    expect((await putAvatar(ada.agent, HTML, "evil.png", "image/png")).status).toBe(415);
    expect((await putAvatar(ada.agent, SVG, "logo.svg", "image/svg+xml")).status).toBe(415);
    expect((await putAvatar(ada.agent, PDF, "doc.png", "image/png")).status).toBe(415);
    expect((await ada.agent.put(`${API}/users/me/avatar`)).status).toBe(400);
  });

  it("enforces the size limit", async () => {
    const ada = await signup();
    const big = Buffer.concat([PNG, Buffer.alloc(600 * 1024)]);
    const res = await putAvatar(ada.agent, big);
    expect(res.status).toBe(413);
    expect(res.body.message).toContain("512 KB");
  });
});

describe("task attachments", () => {
  async function setup() {
    const [ada, bob, cy, outsider] = [await signup(), await signup(), await signup(), await signup()];
    const project = await makeProject(ada, [
      { ...bob, role: "member" },
      { ...cy, role: "member" },
    ]);
    const task = await newTask(ada, project._id);
    const base = `${API}/projects/${project._id}/tasks/${task._id}/attachments`;
    const attach = (who, buf, name = "notes.pdf") => who.agent.post(base).attach("file", buf, { filename: name });
    return { ada, bob, cy, outsider, project, task, base, attach };
  }

  it("members attach files; they download as attachments; outsiders can't reach them", async () => {
    const { bob, cy, outsider, project, task, attach } = await setup();
    const res = await attach(bob, PDF, "spec v1.pdf");
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "spec v1.pdf", contentType: "application/pdf", size: PDF.length });

    const tasks = (await cy.agent.get(`${API}/projects/${project._id}/tasks`)).body.data;
    expect(tasks.find((t) => t._id === task._id).attachments).toHaveLength(1);

    const dl = await cy.agent.get(`${API}/files/${res.body.data.file}`);
    expect(dl.status).toBe(200);
    expect(dl.headers["content-disposition"]).toMatch(/^attachment; filename="spec v1\.pdf"/);
    expect((await outsider.agent.get(`${API}/files/${res.body.data.file}`)).status).toBe(404);
    expect((await attach(outsider, PDF)).status).toBe(404);
  });

  it("accepts images, PDF and plain text only; binary files posing as documents are rejected", async () => {
    const { bob, cy, attach } = await setup();
    expect((await attach(bob, PNG, "pic.png")).status).toBe(201);
    expect((await attach(bob, TEXT, "data.csv")).status).toBe(201);
    expect((await attach(bob, EXE, "setup.pdf")).status).toBe(415);
    expect((await attach(bob, Buffer.alloc(0), "empty.txt")).status).toBe(415);
  });

  it("HTML and SVG are just text: stored as text/plain and only ever served as a download, never rendered", async () => {
    const { bob, cy, attach } = await setup();
    for (const [buf, name] of [
      [HTML, "page.html"],
      [SVG, "logo.svg"],
    ]) {
      const res = await attach(bob, buf, name);
      expect(res.status).toBe(201);
      expect(res.body.data.contentType).toBe("text/plain");
      const dl = await cy.agent.get(`${API}/files/${res.body.data.file}`);
      expect(dl.headers["content-type"]).toMatch(/^text\/plain/);
      expect(dl.headers["content-disposition"]).toMatch(/^attachment/);
      expect(dl.headers["x-content-type-options"]).toBe("nosniff");
    }
  });

  it("cleans the file name and limits size and count", async () => {
    const { bob, attach } = await setup();
    const res = await attach(bob, TEXT, '../../etc/pass"wd.txt');
    expect(res.body.data.name).not.toMatch(/[\\/"]/);
    const tooBig = Buffer.concat([PDF, Buffer.alloc(2.2 * 1024 * 1024)]);
    expect((await attach(bob, tooBig)).status).toBe(413);
    for (let i = 0; i < 4; i++) await attach(bob, TEXT, `f${i}.txt`).expect(201);
    expect((await attach(bob, TEXT, "sixth.txt")).status).toBe(400);
  });

  it("uploader or a project admin can remove; others can't; deleting the task deletes the files", async () => {
    const { ada, bob, cy, project, task, base, attach } = await setup();
    const fileId = (await attach(bob, PDF)).body.data.file;
    expect((await cy.agent.delete(`${base}/${fileId}`)).status).toBe(403);
    expect((await bob.agent.delete(`${base}/${fileId}`)).status).toBe(200);
    expect(await File.countDocuments()).toBe(0);

    await attach(cy, PDF).expect(201);
    expect(await File.countDocuments()).toBe(1);
    await ada.agent.delete(`${API}/projects/${project._id}/tasks/${task._id}`).expect(200);
    expect(await File.countDocuments()).toBe(0);
  });

  it("deleting the project deletes every file in it", async () => {
    const { ada, project, attach } = await setup();
    await attach(ada, PDF).expect(201);
    await ada.agent.delete(`${API}/projects/${project._id}`).expect(200);
    expect(await File.countDocuments()).toBe(0);
  });
});
