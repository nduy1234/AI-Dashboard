import * as oidc from "openid-client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  REFRESH_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  signAccessToken,
  signRefreshToken,
  verifyAuthToken,
  getBearerToken,
  type SessionData,
} from "../lib/auth";
import {
  upsertUserFromClaims,
  findUserByEmail,
  createEmailUser,
  updateUserOtp,
  markEmailVerified,
} from "../repositories/userRepository";
import { onboardUserAfterLogin } from "../services/onboardingService";
import { sendEmail, buildOtpEmailPayload } from "../lib/email";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;
const REFRESH_COOKIE_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000; // 100 years

const router: IRouter = Router();

const googleStartSchema = z.object({
  redirectUri: z.string().url(),
  returnTo: z.string().optional(),
});

const googleExchangeSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  redirectUri: z.string().url(),
});

function getOrigin(req: Request): string {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL;
  }
  const isLocal = req.hostname === "localhost" || req.hostname === "127.0.0.1";
  const proto = req.headers["x-forwarded-proto"] || (isLocal ? "http" : "https");
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function shouldUseSecureCookies(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setRefreshCookie(req: Request, res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: shouldUseSecureCookies(req),
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_COOKIE_TTL_MS,
  });
}

function setOidcCookie(req: Request, res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: shouldUseSecureCookies(req),
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.get("/auth/google/start", async (req: Request, res: Response) => {
  const parsed = googleStartSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "redirectUri is required and must be a valid URL" });
    return;
  }

  const config = await getOidcConfig();
  const { redirectUri } = parsed.data;
  const returnTo = getSafeReturnTo(parsed.data.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(req, res, "code_verifier", codeVerifier);
  setOidcCookie(req, res, "nonce", nonce);
  setOidcCookie(req, res, "state", state);
  setOidcCookie(req, res, "return_to", returnTo);

  res.json({
    authUrl: redirectTo.href,
    state,
  });
});

router.post("/auth/google/exchange", async (req: Request, res: Response) => {
  const parsed = googleExchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const config = await getOidcConfig();
  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.status(400).json({ error: "Missing OAuth verifier state; restart login flow" });
    return;
  }

  const { code, state, redirectUri } = parsed.data;
  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set("state", state);
  callbackUrl.searchParams.set("iss", ISSUER_URL);

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.status(401).json({ error: "OAuth exchange failed" });
    return;
  }

  const claims = tokens.claims();
  if (!claims) {
    res.status(401).json({ error: "Missing ID token claims" });
    return;
  }

  const dbUser = await upsertUserFromClaims(
    claims as unknown as Record<string, unknown>,
  );
  await onboardUserAfterLogin(dbUser.id, dbUser.firstName);

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  const accessToken = signAccessToken(sessionData.user, sid);
  const refreshToken = signRefreshToken(sessionData.user, sid);

  setSessionCookie(res, sid);
  setRefreshCookie(req, res, refreshToken);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  res.json({
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    user: sessionData.user,
  });
});

router.post("/auth/refresh", async (req: Request, res: Response) => {
  const tokenFromBody = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : undefined;
  const tokenFromCookie = req.cookies?.[REFRESH_COOKIE];
  const bearer = getBearerToken(req);
  const refreshToken = tokenFromBody ?? tokenFromCookie ?? bearer;

  if (!refreshToken) {
    res.status(401).json({ error: "Missing refresh token" });
    return;
  }

  const payload = verifyAuthToken(refreshToken);
  if (!payload || payload.type !== "refresh") {
    res.status(401).json({ error: "Invalid refresh token" });
    return;
  }

  const currentSid = payload.sid;
  const sessionData = await getSession(currentSid);
  if (!sessionData || sessionData.user.id !== payload.sub) {
    res.status(401).json({ error: "Session not found" });
    return;
  }

  const accessToken = signAccessToken(sessionData.user, currentSid);
  const newRefreshToken = signRefreshToken(sessionData.user, currentSid);
  setRefreshCookie(req, res, newRefreshToken);

  res.json({
    accessToken,
    refreshToken: newRefreshToken,
    tokenType: "Bearer",
    user: sessionData.user,
  });
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(req, res, "code_verifier", codeVerifier);
  setOidcCookie(req, res, "nonce", nonce);
  setOidcCookie(req, res, "state", state);
  setOidcCookie(req, res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUserFromClaims(
    claims as unknown as Record<string, unknown>,
  );

  await onboardUserAfterLogin(dbUser.id, dbUser.firstName);

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);

  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.clearCookie(REFRESH_COOKIE, { path: "/" });

  try {
    const endSessionUrl = oidc.buildEndSessionUrl(config, {
      post_logout_redirect_uri: origin,
    });
    res.redirect(endSessionUrl.href);
  } catch {
    // Some providers (e.g. Google) do not expose an end-session endpoint.
    // Local logout is already completed, so redirect back to app origin.
    res.redirect(origin);
  }
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUserFromClaims(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      console.error("Mobile token exchange error:", err);
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

// ─── Email / Password Auth ────────────────────────────────────────────────────

const OTP_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const BCRYPT_ROUNDS = 12;

function generateOtp(): string {
  // crypto.randomInt is cryptographically secure.
  return crypto.randomInt(100_000, 1_000_000).toString();
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().max(60).optional(),
  lastName: z.string().max(60).optional(),
  // Honeypot — must be absent or empty to pass bot check.
  hp: z.string().max(0).optional(),
});

const emailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

const resendOtpSchema = z.object({
  email: z.string().email(),
});

router.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid registration details. Check your email and ensure your password is at least 8 characters." });
      return;
    }

    const { email, password, firstName, lastName, hp } = parsed.data;

    // Honeypot check — bots fill every field, humans leave it blank.
    if (hp && hp.length > 0) {
      res.status(201).json({ requiresVerification: true });
      return;
    }

    const existing = await findUserByEmail(email);

    if (existing) {
      if (!existing.passwordHash) {
        res.status(409).json({ error: "This email is linked to a Google account. Please use 'Sign in with Google'." });
        return;
      }
      if (existing.emailVerified) {
        res.status(409).json({ error: "An account with this email already exists. Please sign in." });
        return;
      }
      // Unverified — refresh OTP and resend.
      const otp = generateOtp();
      const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
      const expiry = new Date(Date.now() + OTP_EXPIRY_MS);
      await updateUserOtp(existing.id, otpHash, expiry);
      const emailPayload = buildOtpEmailPayload(otp, existing.firstName);
      await sendEmail({ to: email, ...emailPayload });
      res.status(201).json({ requiresVerification: true });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const expiry = new Date(Date.now() + OTP_EXPIRY_MS);

    await createEmailUser({
      email,
      passwordHash,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      emailVerificationToken: otpHash,
      emailVerificationTokenExpiry: expiry,
    });

    const emailPayload = buildOtpEmailPayload(otp, firstName);
    await sendEmail({ to: email, ...emailPayload });

    res.status(201).json({ requiresVerification: true });
  } catch (err) {
    console.error("[auth/register] unexpected error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/auth/login/email", async (req: Request, res: Response) => {
  try {
    const parsed = emailLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid credentials." });
      return;
    }

    const { email, password } = parsed.data;
    const user = await findUserByEmail(email);

    // Constant-time comparison to avoid timing-based user enumeration.
    const dummyHash = "$2a$12$invalidhashfortimingprotectiononly.........";
    const passwordOk = await bcrypt.compare(
      password,
      user?.passwordHash ?? dummyHash,
    );

    if (!user || !user.passwordHash || !passwordOk) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        error: "Please verify your email address before signing in.",
        code: "email_not_verified",
      });
      return;
    }

    const sessionData: SessionData = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      },
      access_token: "",
    };

    const sid = await createSession(sessionData);
    const accessToken = signAccessToken(sessionData.user, sid);
    const refreshToken = signRefreshToken(sessionData.user, sid);

    setSessionCookie(res, sid);
    setRefreshCookie(req, res, refreshToken);

    res.json({
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      user: sessionData.user,
    });
  } catch (err) {
    console.error("[auth/login/email] unexpected error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/auth/verify-otp", async (req: Request, res: Response) => {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request." });
      return;
    }

    const { email, otp } = parsed.data;
    const user = await findUserByEmail(email);

    if (!user || !user.emailVerificationToken) {
      res.status(400).json({ error: "Verification code is invalid or has expired." });
      return;
    }

    if (user.emailVerificationTokenExpiry && user.emailVerificationTokenExpiry < new Date()) {
      res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      return;
    }

    const otpValid = await bcrypt.compare(otp, user.emailVerificationToken);
    if (!otpValid) {
      res.status(400).json({ error: "Incorrect verification code. Please try again." });
      return;
    }

    const verifiedUser = await markEmailVerified(user.id);
    await onboardUserAfterLogin(verifiedUser.id, verifiedUser.firstName);

    const sessionData: SessionData = {
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        firstName: verifiedUser.firstName,
        lastName: verifiedUser.lastName,
        profileImageUrl: verifiedUser.profileImageUrl,
      },
      access_token: "",
    };

    const sid = await createSession(sessionData);
    const accessToken = signAccessToken(sessionData.user, sid);
    const refreshToken = signRefreshToken(sessionData.user, sid);

    setSessionCookie(res, sid);
    setRefreshCookie(req, res, refreshToken);

    res.json({
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      user: sessionData.user,
    });
  } catch (err) {
    console.error("[auth/verify-otp] unexpected error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/auth/resend-otp", async (req: Request, res: Response) => {
  try {
    const parsed = resendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid email address." });
      return;
    }

    const { email } = parsed.data;
    const user = await findUserByEmail(email);

    // Always return 200 to avoid user enumeration.
    if (!user || user.emailVerified) {
      res.json({ success: true });
      return;
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const expiry = new Date(Date.now() + OTP_EXPIRY_MS);
    await updateUserOtp(user.id, otpHash, expiry);
    const emailPayload = buildOtpEmailPayload(otp, user.firstName);
    await sendEmail({ to: email, ...emailPayload });

    res.json({ success: true });
  } catch (err) {
    console.error("[auth/resend-otp] unexpected error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
