import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const API_BASE = "/api/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "canceled"
  | "past_due"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export interface SubscriptionSummary {
  status: SubscriptionStatus;
  daysLeft: number | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
}

export interface UserMe {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isPro: boolean;
  subscriptionExpiry: string | null;
  stripeCustomerId: string | null;
  subscription: SubscriptionSummary | null;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchUserMe(): Promise<UserMe> {
  const res = await fetch(`${API_BASE}/user/me`, {
    credentials: "include",
    // Bypass browser cache — matches server-side no-store header
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch user profile");
  return res.json() as Promise<UserMe>;
}

async function startCheckout(successUrl?: string, cancelUrl?: string): Promise<string> {
  const res = await fetch(`${API_BASE}/billing/checkout`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ successUrl, cancelUrl }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? "Failed to create checkout session");
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

async function openBillingPortal(returnUrl?: string): Promise<string> {
  const res = await fetch(`${API_BASE}/billing/portal`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnUrl }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? "Failed to open billing portal");
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

// ---------------------------------------------------------------------------
// Core hook — useUserMe
// ---------------------------------------------------------------------------

const USER_ME_KEY = ["user", "me"] as const;

/**
 * Primary source of truth for the user's pro status.
 * Polls every 5 minutes in normal operation.
 * Used by all billing-aware components.
 */
export function useUserMe() {
  const { data, isLoading, error } = useQuery<UserMe>({
    queryKey: USER_ME_KEY,
    queryFn: fetchUserMe,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const sub = data?.subscription;
  const status = (sub?.status ?? "none") as SubscriptionStatus;

  return {
    user: data ?? null,
    isLoading,
    error,
    isPro: data?.isPro ?? false,
    status,
    isTrialing: status === "trialing",
    isActive: status === "active",
    isPastDue: status === "past_due",
    isCanceled: status === "canceled",
    hasAccess: data?.isPro ?? false,
    daysLeft: sub?.daysLeft ?? null,
    subscriptionExpiry: data?.subscriptionExpiry ?? null,
  };
}

// ---------------------------------------------------------------------------
// Post-payment polling hook
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_MS = 60_000; // give up after 60 s

/**
 * useUpgradePolling
 *
 * Activated when `?subscription=success` is in the URL.
 * Force-fetches /user/me every 2 s (bypassing cache) until:
 *  (a) isPro flips true — webhook has landed  ✓
 *  (b) 60 s elapse      — give up gracefully  ✗
 *
 * Returns:
 *  - `isPolling`   true while waiting
 *  - `isConfirmed` true once isPro is confirmed from the server
 */
export function useUpgradePolling(active: boolean) {
  const queryClient = useQueryClient();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [timedOut, setTimedOut]     = useState(false);

  useEffect(() => {
    if (!active || isConfirmed) return;

    let stopped = false;

    // Hard timeout — stop showing spinner after MAX_POLL_MS
    const timeout = setTimeout(() => {
      stopped = true;
      setTimedOut(true);
    }, MAX_POLL_MS);

    const poll = async () => {
      if (stopped) return;
      try {
        // fetchQuery with staleTime:0 always hits the network
        const data = await queryClient.fetchQuery<UserMe>({
          queryKey: USER_ME_KEY,
          queryFn: fetchUserMe,
          staleTime: 0,
        });
        if (data.isPro) {
          stopped = true;
          setIsConfirmed(true);
          clearTimeout(timeout);
          return;
        }
      } catch {
        // network hiccup — keep trying until timeout
      }
      if (!stopped) setTimeout(poll, POLL_INTERVAL_MS);
    };

    // Kick off first poll immediately
    void poll();

    return () => {
      stopped = true;
      clearTimeout(timeout);
    };
  }, [active, isConfirmed, queryClient]);

  return {
    isPolling: active && !isConfirmed && !timedOut,
    isConfirmed,
    timedOut,
  };
}

// ---------------------------------------------------------------------------
// Subscription-specific hook (wraps useUserMe for backward compat)
// ---------------------------------------------------------------------------

/** @deprecated Prefer useUserMe() — kept for components that use the old API. */
export function useSubscription() {
  return useUserMe();
}

// ---------------------------------------------------------------------------
// Billing actions
// ---------------------------------------------------------------------------

/**
 * Redirects the user to Stripe Checkout to start a 14-day free trial.
 */
export function useStartTrial() {
  return useMutation({
    mutationFn: ({
      successUrl,
      cancelUrl,
    }: { successUrl?: string; cancelUrl?: string } = {}) =>
      startCheckout(successUrl, cancelUrl),
    onSuccess: (url) => {
      window.location.href = url;
    },
  });
}

/**
 * Opens the Stripe Billing Portal for subscription management.
 */
export function useBillingPortal() {
  return useMutation({
    mutationFn: ({ returnUrl }: { returnUrl?: string } = {}) =>
      openBillingPortal(returnUrl),
    onSuccess: (url) => {
      window.location.href = url;
    },
  });
}

/**
 * Imperatively invalidates the user/me cache.
 * Call after returning from Stripe Checkout.
 */
export function useRefreshSubscription() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: USER_ME_KEY });
}
