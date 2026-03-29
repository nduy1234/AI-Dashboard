import * as oidc from "openid-client";
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
import { upsertUserFromClaims } from "../repositories/userRepository";
import { onboardUserAfterLogin } from "../services/onboardingService";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;
const REFRESH_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

export default router;
