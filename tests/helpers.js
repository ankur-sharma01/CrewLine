import request from "supertest";
import mongoose from "mongoose";
import connectDB from "../src/db/index.js";

export const app = (await import("../src/app.js")).default;
export const API = "/api/v1";

export const clearDb = async () => {
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }

  if (mongoose.connection.db) {
    try {
      await mongoose.connection.db.dropDatabase();
    } catch {
      // Some test environments may have no database selected yet; fall back to deleting collections.
      const collections = await mongoose.connection.db.collections();
      await Promise.all(collections.map((c) => c.deleteMany({})));
    }
  }

  globalThis.__mails.length = 0;
};

export const closeDb = async () => {
  if (mongoose.connection.readyState) {
    await mongoose.connection.close();
  }

  const cache = globalThis.__mongooseCache;
  if (cache) {
    cache.conn = null;
    cache.promise = null;
  }
};

// last email sent to an address
export const lastMail = (email) => {
  const mail = [...globalThis.__mails].reverse().find((m) => m.email === email);
  if (!mail) return null;
  const link = mail.mailgenContent.body.action.button.link;
  return { subject: mail.subject, link, token: link.split("/").pop() };
};

let counter = 0;
const unique = () => `${++counter}${Math.random().toString(36).slice(2, 6)}`;

// makes an account and returns a logged-in agent (it keeps the cookies)
export async function signup(overrides = {}) {
  const id = unique();
  const creds = {
    email: `user${id}@test.dev`,
    username: `u${id}`,
    password: "password123",
    fullName: `User ${id}`,
    ...overrides,
  };
  const agent = request.agent(app);
  await agent.post(`${API}/auth/register`).send(creds).expect(201);
  await agent.post(`${API}/auth/login`).send({ email: creds.email, password: creds.password }).expect(200);
  const me = (await agent.get(`${API}/auth/current-user`).expect(200)).body.data;
  return { agent, user: me, creds };
}

export const anon = () => request.agent(app);

// project owned by `owner`, members added with their roles
export async function makeProject(owner, members = [], name = "Test project") {
  const project = (await owner.agent.post(`${API}/projects`).send({ name }).expect(201)).body.data;
  for (const m of members) {
    await owner.agent
      .post(`${API}/projects/${project._id}/members`)
      .send({ email: m.user.email, role: m.role })
      .expect(201);
  }
  return project;
}

export const newTask = async (owner, projectId, body = {}) =>
  (
    await owner.agent
      .post(`${API}/projects/${projectId}/tasks`)
      .send({ title: "A task", ...body })
      .expect(201)
  ).body.data;

// cookie value from a response
export const cookieValue = (res, name) =>
  (res.headers["set-cookie"] || [])
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
