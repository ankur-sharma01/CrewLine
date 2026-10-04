import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { API, anon, clearDb, closeDb, cookieValue, lastMail, signup } from "./helpers.js";

beforeEach(clearDb);
afterAll(closeDb);

describe("register + login", () => {
  it("rejects an invalid body with per-field errors (422)", async () => {
    const res = await anon().post(`${API}/auth/register`).send({ email: "nope", username: "A B", password: "123" });
    expect(res.status).toBe(422);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("creates an account without leaking secrets, and refuses duplicates", async () => {
    const creds = { email: "a@test.dev", username: "alice", password: "password123", fullName: "Alice A" };
    const res = await anon().post(`${API}/auth/register`).send(creds);
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      email: "a@test.dev",
      username: "alice",
      fullName: "Alice A",
      isEmailVerified: false,
      hasPassword: true,
    });
    for (const secret of ["password", "refreshToken", "emailVerificationToken", "forgotPasswordToken"]) {
      expect(res.body.data.user).not.toHaveProperty(secret);
    }
    expect((await anon().post(`${API}/auth/register`).send(creds)).status).toBe(409);
  });

  it("logs in by email or username, with one generic error for every failure", async () => {
    const { creds } = await signup();
    const wrong = await anon().post(`${API}/auth/login`).send({ email: creds.email, password: "wrong-pass1" });
    const ghost = await anon().post(`${API}/auth/login`).send({ email: "ghost@test.dev", password: "password123" });
    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(ghost.body.message).toBe(wrong.body.message);

    const byUsername = await anon()
      .post(`${API}/auth/login`)
      .send({ username: creds.username, password: creds.password });
    expect(byUsername.status).toBe(200);
    expect(byUsername.headers["set-cookie"].join(";")).toMatch(/accessToken=.*HttpOnly.*SameSite=Lax/s);
    expect((await anon().post(`${API}/auth/login`).send({ password: "password123" })).status).toBe(422);
  });

  it("current-user needs a valid cookie", async () => {
    expect((await anon().get(`${API}/auth/current-user`)).status).toBe(401);
    expect((await anon().get(`${API}/auth/current-user`).set("Cookie", "accessToken=garbage")).status).toBe(401);
  });

  it("answers malformed JSON with a JSON 400", async () => {
    const res = await anon().post(`${API}/auth/login`).set("Content-Type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("email verification", () => {
  it("verifies once, then the token is spent", async () => {
    const { agent, creds } = await signup();
    const { token } = lastMail(creds.email);
    expect((await agent.get(`${API}/auth/verify-email/deadbeef`)).status).toBe(400);
    expect((await agent.get(`${API}/auth/verify-email/${token}`)).status).toBe(200);
    expect((await agent.get(`${API}/auth/verify-email/${token}`)).status).toBe(400);
    expect((await agent.get(`${API}/auth/current-user`)).body.data.isEmailVerified).toBe(true);
    expect((await agent.post(`${API}/auth/resend-email-verification`)).status).toBe(409);
  });

  it("the emailed link points at the frontend page", async () => {
    const { creds } = await signup();
    expect(lastMail(creds.email).link).toMatch(/^http:\/\/localhost:5173\/verify-email\/\w+$/);
  });
});

describe("sessions", () => {
  it("rotates refresh tokens and rejects a reused one", async () => {
    const { creds } = await signup();
    const agent = anon();
    const login = await agent.post(`${API}/auth/login`).send({ email: creds.email, password: creds.password });
    const oldRefresh = cookieValue(login, "refreshToken");

    const refreshed = await agent.post(`${API}/auth/refresh-token`).send({});
    expect(refreshed.status).toBe(200);
    expect(cookieValue(refreshed, "refreshToken")).not.toBe(oldRefresh);

    const stolen = await anon().post(`${API}/auth/refresh-token`).set("Cookie", `refreshToken=${oldRefresh}`).send({});
    expect(stolen.status).toBe(401);
  });

  it("logout ends the session", async () => {
    const { agent } = await signup();
    expect((await agent.post(`${API}/auth/logout`)).status).toBe(200);
    expect((await agent.get(`${API}/auth/current-user`)).status).toBe(401);
  });
});

describe("passwords", () => {
  it("change-password checks the old one and the new rules", async () => {
    const { agent, creds } = await signup();
    expect(
      (await agent.post(`${API}/auth/change-password`).send({ oldPassword: "nope", newPassword: "newpassword1" }))
        .status,
    ).toBe(400);
    expect(
      (await agent.post(`${API}/auth/change-password`).send({ oldPassword: creds.password, newPassword: "short" }))
        .status,
    ).toBe(422);
    expect(
      (
        await agent
          .post(`${API}/auth/change-password`)
          .send({ oldPassword: creds.password, newPassword: "x".repeat(73) })
      ).status,
    ).toBe(422);
    expect(
      (
        await agent
          .post(`${API}/auth/change-password`)
          .send({ oldPassword: creds.password, newPassword: creds.password })
      ).status,
    ).toBe(400);
    expect(
      (
        await agent
          .post(`${API}/auth/change-password`)
          .send({ oldPassword: creds.password, newPassword: "newpassword1" })
      ).status,
    ).toBe(200);
    expect((await anon().post(`${API}/auth/login`).send({ email: creds.email, password: creds.password })).status).toBe(
      401,
    );
    expect((await anon().post(`${API}/auth/login`).send({ email: creds.email, password: "newpassword1" })).status).toBe(
      200,
    );
  });

  it("forgot-password answers identically for known and unknown emails, and reset signs old sessions out", async () => {
    const { agent, creds } = await signup();
    const known = await anon().post(`${API}/auth/forgot-password`).send({ email: creds.email });
    const unknown = await anon().post(`${API}/auth/forgot-password`).send({ email: "ghost@test.dev" });
    expect(known.status).toBe(200);
    expect(unknown.body.message).toBe(known.body.message);
    expect(lastMail("ghost@test.dev")).toBeNull();

    const { token } = lastMail(creds.email);
    expect((await anon().post(`${API}/auth/reset-password/badtoken`).send({ newPassword: "brandnew123" })).status).toBe(
      400,
    );
    expect((await anon().post(`${API}/auth/reset-password/${token}`).send({ newPassword: "short" })).status).toBe(422);
    expect((await anon().post(`${API}/auth/reset-password/${token}`).send({ newPassword: "brandnew123" })).status).toBe(
      200,
    );
    expect((await agent.post(`${API}/auth/refresh-token`).send({})).status).toBe(401);
    expect((await anon().post(`${API}/auth/login`).send({ email: creds.email, password: "brandnew123" })).status).toBe(
      200,
    );
  });
});
