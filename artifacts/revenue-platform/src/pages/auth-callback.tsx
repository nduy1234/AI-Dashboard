import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AuthUser } from "@workspace/api-client-react";

const AUTH_RETURN_TO_KEY = "auth:returnTo";
const AUTH_CACHE_KEY = "ai-dashboard.auth-cache.v1";

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function getCallbackPath(): string {
  const basePath = normalizeBasePath(import.meta.env.BASE_URL || "/");
  return basePath === "/" ? "/auth/google/callback" : `${basePath}/auth/google/callback`;
}

function getDefaultReturnPath(): string {
  return normalizeBasePath(import.meta.env.BASE_URL || "/");
}

function persistFrontendAuth(input: {
  user: AuthUser | null;
  accessToken?: string | null;
}) {
  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
    const previous = raw
      ? (JSON.parse(raw) as { accessToken?: string | null } | null)
      : null;

    window.localStorage.setItem(
      AUTH_CACHE_KEY,
      JSON.stringify({
        user: input.user,
        accessToken:
          typeof input.accessToken === "string"
            ? input.accessToken
            : previous?.accessToken ?? null,
      }),
    );
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
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

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const search = useMemo(() => new URLSearchParams(window.location.search), []);

  useEffect(() => {
    const code = search.get("code");
    const state = search.get("state");

    if (!code || !state) {
      setError("Missing OAuth callback parameters. Please try signing in again.");
      return;
    }

    const redirectUri = `${window.location.origin}${getCallbackPath()}`;

    void fetch("/api/v1/auth/google/exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        code,
        state,
        redirectUri,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{
          accessToken?: string;
          user?: unknown;
        }>;
      })
      .then((payload) => {
        persistFrontendAuth({
          user: normalizeAuthUser(payload.user),
          accessToken: payload.accessToken ?? null,
        });

        let returnTo = getDefaultReturnPath();
        try {
          const stored = window.sessionStorage.getItem(AUTH_RETURN_TO_KEY);
          if (stored && stored.startsWith("/")) {
            returnTo = stored;
          }
          window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
        } catch {
          // Ignore storage access failures and use default route.
        }
        window.location.replace(returnTo);
      })
      .catch(() => {
        setError("Sign-in failed while exchanging Google authorization code.");
      });
  }, [search]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border border-border/60 bg-card/60 p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold">Completing sign-in</h1>
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={() => window.location.replace(getDefaultReturnPath())}>
              Return to app
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Please wait while we finish authenticating your account.
            </p>
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </>
        )}
      </div>
    </div>
  );
}
