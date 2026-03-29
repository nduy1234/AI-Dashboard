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

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
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

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(() => getPersistedAuthUser());
  const [isLoading, setIsLoading] = useState(user == null);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/v1/auth/user", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          return { user: null as unknown };
        }
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
        if (cancelled) return;
        // Keep persisted user on transient network errors for better UX.
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
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
        // Fallback to server-driven redirect flow if the SPA start endpoint fails.
        window.location.assign(`/api/v1/login?returnTo=${encodeURIComponent(returnTo)}`);
      });
  }, []);

  const logout = useCallback(() => {
    clearPersistedAuthCache();
    window.location.href = "/api/v1/logout";
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
