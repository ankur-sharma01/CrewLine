import crypto from "crypto";
import { User } from "../models/user.models.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { cookieOptions, generateAccessAndRefreshToken, getFrontendUrl, setAuthCookies } from "../utils/auth.utils.js";
import {
  PROVIDERS,
  configuredProviders,
  createPkce,
  exchangeCode,
  isConfigured,
  readState,
  safeNext,
  signState,
} from "../utils/oauth.js";

const STATE_COOKIE = "oauth_state";
const STATE_COOKIE_PATH = "/api/v1/auth/oauth";
const STATE_TTL = 10 * 60 * 1000;
const callbackUrl = (req, provider) => `${getFrontendUrl(req)}/api/v1/auth/oauth/${provider}/callback`;

// providers that have keys set, so the login page knows which buttons to show
export const listProviders = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, configuredProviders(), "OAuth providers"));
});

// step 1: send them to google / github
export const startOAuth = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  if (!PROVIDERS[provider]) throw new ApiError(404, "Unknown sign-in provider");
  const front = getFrontendUrl(req);
  if (!isConfigured(provider)) return res.redirect(`${front}/login?error=oauth_not_configured`);

  const p = PROVIDERS[provider];
  const state = crypto.randomBytes(16).toString("hex");
  const { verifier, challenge } = createPkce();
  const next = safeNext(req.query.next);

  res.cookie(STATE_COOKIE, signState({ state, verifier, provider, next, exp: Date.now() + STATE_TTL }), {
    ...cookieOptions(),
    maxAge: STATE_TTL,
    path: STATE_COOKIE_PATH,
  });

  const url = new URL(p.authUrl());
  url.search = new URLSearchParams({
    client_id: p.clientId(),
    redirect_uri: callbackUrl(req, provider),
    response_type: "code",
    scope: p.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...p.extraAuthParams,
  }).toString();
  return res.redirect(url.toString());
});

// work out which account this identity belongs to
async function findOrCreateUser(provider, profile) {
  // seen this identity before, just log them in
  const key = `${provider}:${profile.providerId}`;
  let user = await User.findOne({ "providers.key": key });
  if (user) return { user };

  if (!profile.email) return { error: "oauth_no_email" };
  // don't trust an unverified email, anyone could claim someone else's account with it
  if (!profile.emailVerified) return { error: "oauth_email_unverified" };

  user = await User.findOne({ email: profile.email }).select("+password");
  if (user) {
    // verified email matches an existing account, link them
    if (!user.isEmailVerified) {
      // someone could have registered this email with their own password and never verified it.
      // the real owner just proved the address, so drop that password and its sessions
      user.password = undefined;
      user.refreshToken = "";
      user.emailVerificationToken = undefined;
      user.emailVerificationExpiry = undefined;
      user.forgotPasswordToken = undefined;
      user.forgotPasswordExpiry = undefined;
    }
    user.providers.push({ provider, providerId: profile.providerId, key });
    user.isEmailVerified = true;
    if (profile.avatarUrl && (!user.avatar?.url || user.avatar.url.includes("placehold.co")))
      user.avatar = { url: profile.avatarUrl };
    await user.save({ validateBeforeSave: false });
    return { user };
  }

  // new user
  user = await User.create({
    email: profile.email,
    username: await uniqueUsername(profile.usernameHint),
    fullName: profile.name,
    isEmailVerified: true,
    providers: [{ provider, providerId: profile.providerId, key }],
    ...(profile.avatarUrl && { avatar: { url: profile.avatarUrl } }),
  });
  return { user };
}

async function uniqueUsername(hint = "") {
  let base = hint
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 14);
  if (base.length < 3) base = `${base}user`.slice(0, 14);
  let candidate = base;
  for (let i = 0; i < 6 && (await User.exists({ username: candidate })); i++) {
    candidate = `${base}${crypto.randomInt(1000, 9999)}`;
  }
  return candidate;
}

// step 2: they come back here
export const oauthCallback = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const front = getFrontendUrl(req);
  const fail = (code) => {
    res.clearCookie(STATE_COOKIE, { ...cookieOptions(), path: STATE_COOKIE_PATH });
    return res.redirect(`${front}/login?error=${code}`);
  };

  if (!PROVIDERS[provider] || !isConfigured(provider)) return fail("oauth_not_configured");
  if (req.query.error) return fail("oauth_denied"); // the user pressed "cancel" at the provider

  // state has to match what we set in step 1
  const saved = readState(req.cookies?.[STATE_COOKIE]);
  if (!saved || saved.provider !== provider || saved.state !== req.query.state || typeof req.query.code !== "string") {
    return fail("oauth_state");
  }

  let result;
  try {
    const accessToken = await exchangeCode(provider, {
      code: req.query.code,
      redirectUri: callbackUrl(req, provider),
      verifier: saved.verifier,
    });
    result = await findOrCreateUser(provider, await PROVIDERS[provider].fetchProfile(accessToken));
  } catch (error) {
    console.error(`OAuth (${provider}) failed:`, error.message);
    return fail("oauth_failed");
  }
  if (result.error) return fail(result.error);

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(result.user._id);
  setAuthCookies(res, accessToken, refreshToken).clearCookie(STATE_COOKIE, {
    ...cookieOptions(),
    path: STATE_COOKIE_PATH,
  });
  return res.redirect(`${front}${saved.next}`);
});
