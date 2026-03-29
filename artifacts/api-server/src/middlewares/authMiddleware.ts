import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import {
  getBearerToken,
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  updateSession,
  verifyAuthToken,
  type SessionData,
} from "../lib/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
      orgId?: number;
    }

    export interface AuthedRequest {
      user: User;
      orgId?: number;
    }
  }
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(
      config,
      session.refresh_token,
    );
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const bearer = getBearerToken(req);
  const bearerTokenPayload = bearer ? verifyAuthToken(bearer) : null;
  const sid = bearerTokenPayload?.sid ?? getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    if (!bearerTokenPayload) {
      await clearSession(res, sid);
    }
    next();
    return;
  }

  if (bearerTokenPayload && bearerTokenPayload.sub !== session.user.id) {
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    if (!bearerTokenPayload) {
      await clearSession(res, sid);
    }
    next();
    return;
  }

  req.user = refreshed.user;
  next();
}
