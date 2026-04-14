import { Router, type IRouter } from "express";
import {
  createCheckoutSession,
  createPortalSession,
  getSubscriptionForUser,
} from "../services/billingService";

const router: IRouter = Router();

// All billing routes require authentication (mounted after requireAuth in index.ts)

/**
 * POST /billing/checkout
 *
 * Creates a Stripe Checkout Session for a 14-day free trial.
 * Responds with the hosted checkout URL to which the client should redirect.
 *
 * Body: { successUrl?: string; cancelUrl?: string }
 */
router.post("/billing/checkout", async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const userEmail = req.user!.email ?? undefined;

  const origin =
    (req.body as Record<string, unknown>).successUrl
      ? undefined
      : `${req.protocol}://${req.get("host")}`;

  const successUrl =
    typeof (req.body as Record<string, unknown>).successUrl === "string"
      ? (req.body as Record<string, string>).successUrl
      : `${origin}/dashboard?subscription=success`;

  const cancelUrl =
    typeof (req.body as Record<string, unknown>).cancelUrl === "string"
      ? (req.body as Record<string, string>).cancelUrl
      : `${origin}/dashboard?subscription=canceled`;

  try {
    const session = await createCheckoutSession(userId, userEmail, successUrl, cancelUrl);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create checkout session";
    console.error("[Billing] createCheckoutSession error:", err);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /billing/portal
 *
 * Creates a Stripe Billing Portal session so users can manage/cancel their
 * subscription or update their payment method.
 *
 * Body: { returnUrl?: string }
 */
router.post("/billing/portal", async (req, res): Promise<void> => {
  const userId = req.user!.id;

  const sub = await getSubscriptionForUser(userId);
  if (!sub?.stripeCustomerId) {
    res.status(404).json({ error: "No active subscription found" });
    return;
  }

  const origin = `${req.protocol}://${req.get("host")}`;
  const returnUrl =
    typeof (req.body as Record<string, unknown>).returnUrl === "string"
      ? (req.body as Record<string, string>).returnUrl
      : `${origin}/dashboard`;

  try {
    const portalSession = await createPortalSession(sub.stripeCustomerId, returnUrl);
    res.json({ url: portalSession.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create portal session";
    console.error("[Billing] createPortalSession error:", err);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /billing/subscription
 *
 * Returns the current user's subscription status from the local database.
 * The UI uses this to decide whether to show the trial banner, restrict
 * features, or display an upgrade prompt.
 */
router.get("/billing/subscription", async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const sub = await getSubscriptionForUser(userId);

  if (!sub) {
    res.json({ status: "none", daysLeft: null, currentPeriodEnd: null, trialEnd: null });
    return;
  }

  // Compute days remaining in the trial (or until subscription renewal)
  const referenceDate =
    sub.status === "trialing" ? sub.trialEnd : sub.currentPeriodEnd;
  let daysLeft: number | null = null;
  if (referenceDate) {
    const diff = referenceDate.getTime() - Date.now();
    daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  res.json({
    status: sub.status,
    daysLeft,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    trialEnd: sub.trialEnd?.toISOString() ?? null,
    hasPaymentMethod: !!sub.stripeCustomerId,
  });
});

export default router;
