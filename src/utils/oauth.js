import crypto from "crypto";
import { isProduction } from "../config/env.js";

const mockBase = () =>
  !isProduction && process.env.OAUTH_MOCK_URL ? process.env.OAUTH_MOCK_URL.replace(/\/$/, "") : null;
const endpoint = (provider, real, mockPath) => (mockBase() ? `${mockBase()}/${provider}/${mockPath}` : real);

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${new URL(url).host} responded with ${res.status}`);
  return res.json();
};

export const PROVIDERS = {
  google: {
    label: "Google",
    scope: "openid email profile",
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authUrl: () => endpoint("google", "https://accounts.google.com/o/oauth2/v2/auth", "authorize"),
    tokenUrl: () => endpoint("google", "https://oauth2.googleapis.com/token", "token"),
    extraAuthParams: { prompt: "select_account" },
    async fetchProfile(accessToken) {
      const u = await fetchJson(endpoint("google", "https://openidconnect.googleapis.com/v1/userinfo", "userinfo"), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const email = u.email?.toLowerCase() ?? null;
      return {
        providerId: String(u.sub),
        email,
        emailVerified: u.email_verified === true || u.email_verified === "true",
        name: u.name,
        avatarUrl: u.picture,
        usernameHint: email?.split("@")[0],
      };
    },
  },
  github: {
    label: "GitHub",
    scope: "read:user user:email",
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
    authUrl: () => endpoint("github", "https://github.com/login/oauth/authorize", "authorize"),
    tokenUrl: () => endpoint("github", "https://github.com/login/oauth/access_token", "token"),
    extraAuthParams: {},
    async fetchProfile(accessToken) {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "basecampy",
      };
      const u = await fetchJson(endpoint("github", "https://api.github.com/user", "userinfo"), { headers });
      // the profile email can be missing or unverified, /user/emails has the verified one
      const emails = await fetchJson(endpoint("github", "https://api.github.com/user/emails", "emails"), {
        headers,
      }).catch(() => []);
      const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : null;
      return {
        providerId: String(u.id),
        email: primary?.email?.toLowerCase() ?? null,
        emailVerified: Boolean(primary),
        name: u.name || u.login,
        avatarUrl: u.avatar_url,
        usernameHint: u.login,
      };
    },
  },
};

export const isConfigured = (name) => Boolean(PROVIDERS[name]?.clientId() && PROVIDERS[name]?.clientSecret());
export const configuredProviders = () => Object.fromEntries(Object.keys(PROVIDERS).map((n) => [n, isConfigured(n)]));

// PKCE
export const createPkce = () => {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
};

// state cookie: signed so it can't be forged, nothing stored on the server (so it works on serverless)
const signingKey = () => crypto.createHash("sha256").update(`oauth-state:${process.env.REFRESH_TOKEN_SECRET}`).digest();
const sign = (body) => crypto.createHmac("sha256", signingKey()).update(body).digest("base64url");

export const signState = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
};

export const readState = (value) => {
  if (typeof value !== "string" || !value.includes(".")) return null;
  const [body, signature] = value.split(".");
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature || "");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
};

// only paths inside the app, anything else would be an open redirect
export const safeNext = (next) =>
  typeof next === "string" && next.length < 200 && /^\/(?![/\\])[A-Za-z0-9\-._~/%?=&]*$/.test(next) ? next : "/";

export async function exchangeCode(name, { code, redirectUri, verifier }) {
  const p = PROVIDERS[name];
  const res = await fetch(p.tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: p.clientId(),
      client_secret: p.clientSecret(),
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json().catch(() => ({}));
  // github sends errors with a 200, so check for the token itself
  if (!res.ok || !json.access_token) throw new Error(`token exchange failed: ${json.error || res.status}`);
  return json.access_token;
}
