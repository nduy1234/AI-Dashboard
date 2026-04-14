import { Router, type IRouter } from "express";
import { getUserProStatus, getSubscriptionForUser } from "../services/billingService";

const router: IRouter = Router();

/**
 * GET /user/me
 *
 * Returns the current authenticated user's profile including real-time
 * is_pro status from PostgreSQL.
 *
 * No-cache headers are set so the browser and any intermediate proxy
 * never serves a stale "Free" state after a successful payment.
 *
 * Used by the frontend polling hook to detect when the Stripe webhook
 * has landed and is_pro has flipped to true.
 */
router.get("/user/me", async (req, res): Promise<void> => {
  const userId = req.user!.id;

  const [user, subscription] = await Promise.all([
    getUserProStatus(userId),
    getSubscriptionForUser(userId),
  ]);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Compute days left for trial/period display
  const referenceDate =
    subscription?.status === "trialing"
      ? subscription.trialEnd
      : subscription?.currentPeriodEnd ?? null;

  let daysLeft: number | null = null;
  if (referenceDate) {
    const diff = referenceDate.getTime() - Date.now();
    daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // Hard no-cache — the whole point is to get the freshest isPro value
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
    isPro: user.isPro,
    subscriptionExpiry: user.subscriptionExpiry?.toISOString() ?? null,
    stripeCustomerId: user.stripeCustomerId ?? null,
    subscription: subscription
      ? {
          status: subscription.status,
          daysLeft,
          trialEnd: subscription.trialEnd?.toISOString() ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        }
      : null,
  });
});

export default router;
