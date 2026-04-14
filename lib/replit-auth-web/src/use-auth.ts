import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";
import {
  clearPersistedAuthCache,
  getPersistedAuthUser,
  persistAuthCache,
} from "./auth-storage";

export type { AuthUser };

const AUTH_RETURN_TO_KEY = "auth:returnTo";

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function getCallbackPath(): string {
  const basePath = normalizeBasePath(import.meta.env.BASE_URL || "/");
  return basePath === "/" ? "/auth/google/callback" : `${basePath}/auth/google/callback`;
}

function getCurrentReturnTo(): string {
  const value = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return value.startsWith("/") ? value : "/";
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeAuthUser(input: unknown): AuthUser | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const id = toStringOrNull(record.id);
  if (!id) return null;

  return {
    id,
    email: toStringOrNull(record.email),
    firstName: toStringOrNull(record.firstName ?? record.first_name),
    lastName: toStringOrNull(record.lastName ?? record.last_name),
    profileImageUrl: toStringOrNull(
      record.profileImageUrl ?? record.profile_image_url ?? record.picture,
    ),
  };
}

export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface RegisterResult {
  requiresVerification: boolean;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Initiate Google OIDC login flow. */
  login: () => void;
  logout: () => void;
  /** Sign in with email + password. Throws a user-friendly Error on failure. */
  loginWithEmail: (email: string, password: string) => Promise<void>;
  /** Register a new account. Returns whether OTP verification is required. Throws on failure. */
  register: (data: RegisterData) => Promise<RegisterResult>;
  /** Submit the 6-digit OTP. Signs the user in on success. Throws on failure. */
  verifyOtp: (email: string, otp: string) => Promise<void>;
  /** Re-send the verification OTP to the given email. */
  resendOtp: (email: string) => Promise<void>;
}

async function apiFetch<T>(
  url: string,
  options: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Ignore parse errors for responses with no body.
  }

  if (!res.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : `Request failed (${res.status})`;
    const err = new Error(message) as Error & { code?: string };
    if (typeof body.code === "string") err.code = body.code;
    throw err;
  }

  return body as T;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(() => getPersistedAuthUser());
  const [isLoading, setIsLoading] = useState(user == null);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/v1/auth/user", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) return { user: null as unknown };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: unknown }>;
      })
      .then((data) => {
        if (cancelled) return;
        const nextUser = normalizeAuthUser(data.user);
        setUser(nextUser);
        if (nextUser) {
          persistAuthCache({ user: nextUser });
        } else {
          clearPersistedAuthCache();
        }
      })
      .catch(() => {
        // Keep persisted user on transient network errors for better UX.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    const returnTo = getCurrentReturnTo();
    const redirectUri = `${window.location.origin}${getCallbackPath()}`;

    try {
      window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, returnTo);
    } catch {
      // Some browser privacy modes can deny storage writes.
    }

    void fetch(
      `/api/v1/auth/google/start?redirectUri=${encodeURIComponent(redirectUri)}&returnTo=${encodeURIComponent(returnTo)}`,
      { credentials: "include" },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ authUrl: string }>;
      })
      .then(({ authUrl }) => {
        window.location.assign(authUrl);
      })
      .catch(() => {
        window.location.assign(`/api/v1/login?returnTo=${encodeURIComponent(returnTo)}`);
      });
  }, []);

  const logout = useCallback(() => {
    clearPersistedAuthCache();
    window.location.href = "/api/v1/logout";
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ accessToken?: string; user?: unknown }>(
      "/api/v1/auth/login/email",
      { method: "POST", body: JSON.stringify({ email, password }) },
    );
    const nextUser = normalizeAuthUser(data.user);
    if (nextUser) {
      persistAuthCache({ user: nextUser, accessToken: data.accessToken ?? null });
      setUser(nextUser);
    }
  }, []);

  const register = useCallback(async (input: RegisterData): Promise<RegisterResult> => {
    const data = await apiFetch<{ requiresVerification: boolean }>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify(input) },
    );
    return { requiresVerification: data.requiresVerification ?? true };
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string) => {
    const data = await apiFetch<{ accessToken?: string; user?: unknown }>(
      "/api/v1/auth/verify-otp",
      { method: "POST", body: JSON.stringify({ email, otp }) },
    );
    const nextUser = normalizeAuthUser(data.user);
    if (nextUser) {
      persistAuthCache({ user: nextUser, accessToken: data.accessToken ?? null });
      setUser(nextUser);
    }
  }, []);

  const resendOtp = useCallback(async (email: string) => {
    await apiFetch("/api/v1/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    loginWithEmail,
    register,
    verifyOtp,
    resendOtp,
  };
}
