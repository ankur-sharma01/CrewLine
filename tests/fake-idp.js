import crypto from "crypto";
import express from "express";

export async function startFakeIdp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  const codes = new Map();
  const identities = {
    google: {
      sub: "google-user-1",
      email: "ada@gmail.test",
      email_verified: true,
      name: "Ada Google",
      picture: "https://img.test/ada.png",
    },
    github: {
      id: 4242,
      login: "ada-gh",
      name: "Ada GitHub",
      avatar_url: "https://img.test/ada-gh.png",
      emails: [{ email: "ada@github.test", primary: true, verified: true }],
    },
  };

  app.get("/:provider/authorize", (req, res) => {
    const { redirect_uri, state, code_challenge, code_challenge_method } = req.query;
    if (code_challenge_method !== "S256" || !code_challenge) return res.status(400).send("PKCE is required");
    const code = crypto.randomBytes(8).toString("hex");
    codes.set(code, { challenge: code_challenge, redirect_uri });
    const back = new URL(redirect_uri);
    back.searchParams.set("code", code);
    back.searchParams.set("state", state);
    res.redirect(back.toString());
  });

  app.post("/:provider/token", (req, res) => {
    const { code, code_verifier = "", redirect_uri, client_secret } = req.body;
    const entry = codes.get(code);
    codes.delete(code); // codes work once
    const verifierOk =
      entry && crypto.createHash("sha256").update(code_verifier).digest("base64url") === entry.challenge;
    if (!entry || !verifierOk || entry.redirect_uri !== redirect_uri || !client_secret)
      return res.status(400).json({ error: "invalid_grant" });
    res.json({ access_token: `token-for-${req.params.provider}`, token_type: "bearer" });
  });

  app.get("/google/userinfo", (req, res) => res.json(identities.google));
  app.get("/github/userinfo", (req, res) => res.json(identities.github));
  app.get("/github/emails", (req, res) => res.json(identities.github.emails));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    identities,
    close: () => new Promise((r) => server.close(r)),
  };
}
