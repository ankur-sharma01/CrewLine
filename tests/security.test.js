import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { API, anon, clearDb, closeDb, signup } from "./helpers.js";

beforeEach(clearDb);
afterAll(closeDb);

describe("rate limiting", () => {
  afterEach(() => {
    process.env.RATE_LIMIT_DISABLED = "true";
  });

  it("limits sensitive endpoints per IP, and says when to retry", async () => {
    process.env.RATE_LIMIT_DISABLED = "false";
    const statuses = [];
    let last;
    for (let i = 0; i < 22; i++) {
      last = await anon()
        .post(`${API}/auth/forgot-password`)
        .send({ email: `nobody${i}@test.dev` });
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);
    expect(last.headers["retry-after"]).toBeDefined();
    expect(last.headers["ratelimit-remaining"]).toBe("0");
    expect(last.body).toMatchObject({ success: false, statusCode: 429 });
  });

  it("limits logins per ACCOUNT even before the IP limit is reached", async () => {
    const { creds } = await signup(); // (signing up logs in once, so do it before switching the limits on)
    process.env.RATE_LIMIT_DISABLED = "false";
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(
        (await anon().post(`${API}/auth/login`).send({ email: creds.email, password: "wrong-password" })).status,
      );
    }
    expect(codes.slice(0, 8).every((c) => c === 401)).toBe(true);
    expect(codes.slice(8)).toEqual([429, 429]);
    // right password is refused too while locked out
    expect((await anon().post(`${API}/auth/login`).send({ email: creds.email, password: creds.password })).status).toBe(
      429,
    );
  });

  it("is off in tests by default so the suite isn't throttled", async () => {
    for (let i = 0; i < 25; i++)
      await anon().post(`${API}/auth/forgot-password`).send({ email: "a@test.dev" }).expect(200);
  });
});

describe("hardening", () => {
  it("sends security headers and hides the framework", async () => {
    const res = await anon().get(`${API}/healthCheck`);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-frame-options"]).toBeDefined();
  });

  it("refuses NoSQL operator injection", async () => {
    await signup();
    const inject = await anon()
      .post(`${API}/auth/login`)
      .send({ email: { $ne: null }, password: "x" });
    expect(inject.status).toBe(400);
    const nested = await anon()
      .post(`${API}/auth/login`)
      .send({ username: "a", password: { $gt: "" } });
    expect(nested.status).toBe(400);
    expect(
      (await anon().post(`${API}/auth/login`).send({ "profile.role": "x", email: "a@b.dev", password: "x" })).status,
    ).toBe(400);
  });

  it("blocks state-changing requests from another origin, allows the same origin", async () => {
    const { creds } = await signup();
    const body = { email: creds.email, password: creds.password };
    const evil = await anon().post(`${API}/auth/login`).set("Origin", "https://evil.example").send(body);
    expect(evil.status).toBe(403);
    const home = await anon()
      .post(`${API}/auth/login`)
      .set("Host", "app.test")
      .set("Origin", "https://app.test")
      .send(body);
    expect(home.status).toBe(200);
    // behind a proxy the Host can differ, FRONTEND_URL's origin is trusted
    const proxied = await anon()
      .post(`${API}/auth/login`)
      .set("Host", "internal:3000")
      .set("Origin", "http://localhost:5173")
      .send(body);
    expect(proxied.status).toBe(200);
    expect((await anon().post(`${API}/auth/login`).set("Origin", "not a url").send(body)).status).toBe(403);
    expect((await anon().post(`${API}/auth/login`).send(body)).status).toBe(200); // no Origin = not a browser
  });

  it("returns JSON for unknown routes and never leaks stack traces", async () => {
    const res = await anon().get(`${API}/nope`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|at \w+ \(/);
  });
});
