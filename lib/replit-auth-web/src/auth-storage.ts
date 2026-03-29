import type { AuthUser } from "@workspace/api-client-react";

const AUTH_CACHE_KEY = "ai-dashboard.auth-cache.v1";

type PersistedAuthCache = {
  user: AuthUser | null;
  accessToken: string | null;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readCache(): PersistedAuthCache | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedAuthCache>;
    return {
      user: parsed.user ?? null,
      accessToken:
        typeof parsed.accessToken === "string" && parsed.accessToken.length > 0
          ? parsed.accessToken
          : null,
    };
  } catch {
    return null;
  }
}

export function getPersistedAuthUser(): AuthUser | null {
  return readCache()?.user ?? null;
}

export function getPersistedAccessToken(): string | null {
  return readCache()?.accessToken ?? null;
}

export function persistAuthCache(input: {
  user: AuthUser | null;
  accessToken?: string | null;
}): void {
  if (!canUseStorage()) return;
  try {
    const previous = readCache();
    const next: PersistedAuthCache = {
      user: input.user,
      accessToken:
        typeof input.accessToken === "string"
          ? input.accessToken
          : previous?.accessToken ?? null,
    };
    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

export function clearPersistedAuthCache(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}
