import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { User } from "../src/models/user.models.js";
import { API, anon, clearDb, closeDb, lastMail, signup } from "./helpers.js";
import { startFakeIdp } from "./fake-idp.js";

let idp;
beforeAll(async () => {
  idp = await startFakeIdp();
  process.env.OAUTH_MOCK_URL = idp.url; // the app now talks to the fake Google/GitHub
});
afterAll(async () => {
  delete process.env.OAUTH_MOCK_URL;
  await idp.close();
  await closeDb();
});
beforeEach(async () => {
  await clearDb();
  idp.identities.google = {
    sub: "google-user-1",
    email: "ada@gmail.test",
    email_verified: true,
    name: "Ada Google",
    picture: "https://img.test/ada.png",
  };
});

// acts as the browser: start, provider, callback
async function loginWith(agent, provider, { next, tamperState, stripCookie } = {}) {
  const start = await agent.get(`${API}/auth/oauth/${provider}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  expect(start.status).toBe(302);
  const atProvider = await fetch(start.headers.location, { redirect: "manual" });
  const back = new URL(atProvider.headers.get("location"));
  if (tamperState) back.searchParams.set("state", "forged");
  // a different browser, so no cookie
  return (stripCookie ? anon() : agent).get(back.pathname + back.search);
}

describe("Google / GitHub sign-in", () => {
  it("lists which providers are configured", async () => {
    expect((await anon().get(`${API}/auth/oauth/providers`)).body.data).toEqual({ google: true, github: true });
  });

  it("start: redirects with state + PKCE (S256) and a signed httpOnly cookie", async () => {
    const res = await anon().get(`${API}/auth/oauth/google`);
    const url = new URL(res.headers.location);
    expect(url.origin).toBe(idp.url);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toHaveLength(32);
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:5173/api/v1/auth/oauth/google/callback");
    expect(res.headers["set-cookie"].join(";")).toMatch(/oauth_state=.*HttpOnly.*SameSite=Lax/s);
    expect((await anon().get(`${API}/auth/oauth/facebook`)).status).toBe(404);
  });

  it("creates a verified, password-less account and logs it in", async () => {
    const agent = anon();
    const res = await loginWith(agent, "google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/");

    const me = (await agent.get(`${API}/auth/current-user`).expect(200)).body.data;
    expect(me).toMatchObject({
      email: "ada@gmail.test",
      fullName: "Ada Google",
      isEmailVerified: true,
      hasPassword: false,
      providers: ["google"],
    });
    expect(me.avatar.url).toBe("https://img.test/ada.png");
    expect(me.username).toBe("ada");

    // logging in again finds the same account
    await loginWith(anon(), "google");
    expect(await User.countDocuments()).toBe(1);
  });

  it("works for GitHub too, using the verified primary email", async () => {
    const agent = anon();
    expect((await loginWith(agent, "github")).headers.location).toBe("http://localhost:5173/");
    const me = (await agent.get(`${API}/auth/current-user`)).body.data;
    expect(me).toMatchObject({ email: "ada@github.test", providers: ["github"], username: "adagh" });
  });

  it("links to an existing account with the same VERIFIED email and keeps its password", async () => {
    const { agent: pw, creds } = await signup({ email: "ada@gmail.test" });
    await pw.get(`${API}/auth/verify-email/${lastMail(creds.email).token}`).expect(200);

    const agent = anon();
    await loginWith(agent, "google");
    const me = (await agent.get(`${API}/auth/current-user`)).body.data;
    expect(me).toMatchObject({
      _id: (await User.findOne({ email: "ada@gmail.test" }))._id.toString(),
      providers: ["google"],
      hasPassword: true,
    });
    expect(await User.countDocuments()).toBe(1);
    expect((await anon().post(`${API}/auth/login`).send({ email: creds.email, password: creds.password })).status).toBe(
      200,
    );
  });

  it("pre-hijacking defense: an unverified squatter's password and sessions are wiped on linking", async () => {
    const { agent: squatter, creds } = await signup({ email: "ada@gmail.test" }); // never verified
    await loginWith(anon(), "google");

    expect((await anon().post(`${API}/auth/login`).send({ email: creds.email, password: creds.password })).status).toBe(
      401,
    );
    expect((await squatter.post(`${API}/auth/refresh-token`).send({})).status).toBe(401);
    expect((await User.findOne({ email: "ada@gmail.test" })).isEmailVerified).toBe(true);
  });

  it("never links on an unverified provider email", async () => {
    idp.identities.google.email_verified = false;
    const res = await loginWith(anon(), "google");
    expect(res.headers.location).toBe("http://localhost:5173/login?error=oauth_email_unverified");
    expect(await User.countDocuments()).toBe(0);
  });

  it("GitHub without a verified email is refused", async () => {
    idp.identities.github.emails = [{ email: "x@github.test", primary: true, verified: false }];
    const res = await loginWith(anon(), "github");
    expect(res.headers.location).toBe("http://localhost:5173/login?error=oauth_no_email");
    idp.identities.github.emails = [{ email: "ada@github.test", primary: true, verified: true }];
  });

  it("rejects a forged state, a missing cookie and a user who pressed cancel", async () => {
    expect((await loginWith(anon(), "google", { tamperState: true })).headers.location).toMatch(/error=oauth_state$/);
    expect((await loginWith(anon(), "google", { stripCookie: true })).headers.location).toMatch(/error=oauth_state$/);
    expect((await anon().get(`${API}/auth/oauth/google/callback?error=access_denied`)).headers.location).toMatch(
      /error=oauth_denied$/,
    );
    expect(await User.countDocuments()).toBe(0);
  });

  it("`next` sends the user back into the app, but never to another site", async () => {
    expect((await loginWith(anon(), "google", { next: "/invite/abc123" })).headers.location).toBe(
      "http://localhost:5173/invite/abc123",
    );
    for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      expect((await loginWith(anon(), "google", { next: evil })).headers.location).toBe("http://localhost:5173/");
    }
  });

  it("an OAuth-only account can't use password login until it sets a password, without needing an old one", async () => {
    const agent = anon();
    await loginWith(agent, "google");
    expect(
      (await anon().post(`${API}/auth/login`).send({ email: "ada@gmail.test", password: "anything123" })).status,
    ).toBe(401);

    expect((await agent.post(`${API}/auth/change-password`).send({ newPassword: "myfirstpassword" })).status).toBe(200);
    expect((await agent.get(`${API}/auth/current-user`)).body.data.hasPassword).toBe(true);
    expect(
      (await anon().post(`${API}/auth/login`).send({ email: "ada@gmail.test", password: "myfirstpassword" })).status,
    ).toBe(200);
  });
});
