import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  daysLeft: number | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  hasPaymentMethod: boolean;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchSubscription(): Promise<SubscriptionInfo> {
  const res = await fetch(`${API_BASE}/billing/subscription`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch subscription");
  return res.json() as Promise<SubscriptionInfo>;
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
// Hooks
// ---------------------------------------------------------------------------

/**
 * Returns the current user's subscription status and helper flags.
 *
 * @example
 * const { isTrialing, isPastDue, daysLeft } = useSubscription();
 */
export function useSubscription() {
  const { data, isLoading, error } = useQuery<SubscriptionInfo>({
    queryKey: ["billing", "subscription"],
    queryFn: fetchSubscription,
    // Refresh every 5 minutes so the banner stays accurate
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const status = data?.status ?? "none";

  return {
    subscription: data ?? null,
    isLoading,
    error,
    status,
    isTrialing: status === "trialing",
    isActive: status === "active",
    isPastDue: status === "past_due",
    isCanceled: status === "canceled",
    hasSubscription: status !== "none",
    /** True when the user has paid access (active or still in trial) */
    hasAccess: status === "active" || status === "trialing",
    /** Days left in trial (trialing) or until next renewal (active) */
    daysLeft: data?.daysLeft ?? null,
  };
}

/**
 * Redirects the user to Stripe Checkout to start a 14-day free trial.
 * Payment method is collected upfront.
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
 * Opens the Stripe Billing Portal so the user can manage their subscription,
 * update their payment method, or cancel.
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
 * Invalidates the subscription cache after returning from Stripe Checkout
 * (call on mount of pages that handle ?subscription=success).
 */
export function useRefreshSubscription() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ["billing", "subscription"] });
}
