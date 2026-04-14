import Stripe from "stripe";
import { db, subscriptionsTable } from "@workspace/db";
import { eq, ne, and } from "drizzle-orm";

type SubscriptionStatus = NonNullable<typeof subscriptionsTable.$inferSelect.status>;

// ---------------------------------------------------------------------------
// Stripe client
// ---------------------------------------------------------------------------

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

// ---------------------------------------------------------------------------
// Checkout & Portal
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Checkout Session for a 14-day free trial.
 * Payment method is collected upfront to maximise conversion once the trial ends.
 */
export async function createCheckoutSession(
  userId: string,
  userEmail: string | null | undefined,
  successUrl: string,
  cancelUrl: string,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PRICE_ID is not set");

  // Reuse an existing Stripe customer if the user already has one
  let stripeCustomerId: string | undefined;
  const [existingSub] = await db
    .select({ stripeCustomerId: subscriptionsTable.stripeCustomerId })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));

  if (existingSub?.stripeCustomerId) {
    stripeCustomerId = existingSub.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email: userEmail ?? undefined,
      metadata: { userId },
    });
    stripeCustomerId = customer.id;
  }

  return stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    // Always collect a payment method so Stripe can charge when the trial ends
    payment_method_collection: "always",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { userId },
    },
    // Allow users to see and manage their trial details post-checkout
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
  });
}

/**
 * Creates a Stripe Billing Portal session so users can manage their subscription,
 * update payment methods, and cancel.
 */
export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
}

// ---------------------------------------------------------------------------
// Subscription read
// ---------------------------------------------------------------------------

export async function getSubscriptionForUser(userId: string) {
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));
  return sub ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDate(unix: number | null | undefined): Date | null {
  return unix ? new Date(unix * 1000) : null;
}

function subId(value: string | Stripe.Subscription | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function customerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * In Stripe API v22+ the period end was moved from Subscription to
 * SubscriptionItem. Fall back gracefully for older/test objects.
 */
function getPeriodEnd(sub: Stripe.Subscription): number | null {
  return sub.items?.data?.[0]?.current_period_end ?? null;
}

/**
 * In Stripe API v22+ the subscription ID on an Invoice lives at
 * invoice.parent.subscription_details.subscription.
 */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent as Stripe.Invoice.Parent | null;
  if (!parent) return null;
  const sd = parent.subscription_details as Stripe.Invoice.Parent.SubscriptionDetails | null;
  if (!sd) return null;
  return subId(sd.subscription as string | Stripe.Subscription | null);
}

// ---------------------------------------------------------------------------
// Webhook handlers
// ---------------------------------------------------------------------------

/**
 * `checkout.session.completed`
 *
 * Creates (or upserts) the subscription record and runs the anti-abuse
 * card-fingerprint check.  If the fingerprint was already used for a trial
 * on a **different** account, the subscription is cancelled immediately.
 */
export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "subscription") return;

  const userId = session.metadata?.userId;
  if (!userId) {
    console.warn("[Billing] checkout.session.completed missing userId metadata");
    return;
  }

  const cId = customerId(session.customer as string | Stripe.Customer | null);
  const sId = subId(session.subscription as string | Stripe.Subscription | null);
  if (!cId || !sId) return;

  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(sId);

  // Resolve card fingerprint from the default payment method
  let cardFingerprint: string | null = null;
  const pmRef = stripeSub.default_payment_method;
  if (pmRef) {
    try {
      const pm = await stripe.paymentMethods.retrieve(
        typeof pmRef === "string" ? pmRef : pmRef.id,
      );
      cardFingerprint = pm.card?.fingerprint ?? null;
    } catch (err) {
      console.warn("[Billing] Could not retrieve payment method for fingerprint:", err);
    }
  }

  // Anti-abuse: block a second free trial from the same card on a different account
  if (cardFingerprint) {
    const [fraudRecord] = await db
      .select({ userId: subscriptionsTable.userId })
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.cardFingerprint, cardFingerprint),
          ne(subscriptionsTable.userId, userId),
        ),
      );

    if (fraudRecord) {
      console.warn(
        `[Billing] Duplicate trial blocked — fingerprint=${cardFingerprint} ` +
          `existing_user=${fraudRecord.userId} new_user=${userId}`,
      );
      await stripe.subscriptions.cancel(sId);
      await upsertSubscription(userId, {
        stripeCustomerId: cId,
        stripeSubscriptionId: sId,
        status: "canceled",
        cardFingerprint,
        currentPeriodEnd: toDate(getPeriodEnd(stripeSub)),
        trialEnd: toDate(stripeSub.trial_end ?? null),
        canceledAt: new Date(),
      });
      return;
    }
  }

  await upsertSubscription(userId, {
    stripeCustomerId: cId,
    stripeSubscriptionId: sId,
    status: stripeSub.status as SubscriptionStatus,
    cardFingerprint,
    currentPeriodEnd: toDate(getPeriodEnd(stripeSub)),
    trialEnd: toDate(stripeSub.trial_end ?? null),
    canceledAt: toDate(stripeSub.canceled_at ?? null),
  });

  console.log(`[Billing] Subscription created for userId=${userId} status=${stripeSub.status}`);
}

/**
 * `customer.subscription.updated`
 *
 * Keeps the local status in sync with Stripe.
 * This fires when the trial ends (→ active or past_due) and on cancellations.
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    // Fall back to look-up by stripeSubscriptionId
    await db
      .update(subscriptionsTable)
      .set({
        status: subscription.status as SubscriptionStatus,
        currentPeriodEnd: toDate(getPeriodEnd(subscription)),
        trialEnd: toDate(subscription.trial_end ?? null),
        canceledAt: toDate(subscription.canceled_at ?? null),
      })
      .where(eq(subscriptionsTable.stripeSubscriptionId, subscription.id));
    return;
  }

  await upsertSubscription(userId, {
    stripeSubscriptionId: subscription.id,
    status: subscription.status as SubscriptionStatus,
    currentPeriodEnd: toDate(getPeriodEnd(subscription)),
    trialEnd: toDate(subscription.trial_end ?? null),
    canceledAt: toDate(subscription.canceled_at ?? null),
  });

  console.log(
    `[Billing] Subscription ${subscription.id} updated → status=${subscription.status}`,
  );
}

/**
 * `invoice.payment_succeeded`
 *
 * Fired when Stripe successfully charges the card at the end of a trial
 * (or for any subsequent billing cycle).  Sets the subscription to 'active'.
 */
export async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
): Promise<void> {
  const sId = getInvoiceSubscriptionId(invoice);
  if (!sId) return;

  await db
    .update(subscriptionsTable)
    .set({ status: "active" })
    .where(eq(subscriptionsTable.stripeSubscriptionId, sId));

  console.log(`[Billing] Invoice payment succeeded — subscription=${sId} → active`);
}

/**
 * `invoice.payment_failed`
 *
 * Fired when Stripe cannot charge the card (expired card, insufficient funds, etc.).
 * Sets the subscription to 'past_due' so the frontend can restrict features.
 */
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  const sId = getInvoiceSubscriptionId(invoice);
  if (!sId) return;

  await db
    .update(subscriptionsTable)
    .set({ status: "past_due" })
    .where(eq(subscriptionsTable.stripeSubscriptionId, sId));

  console.log(`[Billing] Invoice payment FAILED — subscription=${sId} → past_due`);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

type SubUpsert = {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status: SubscriptionStatus;
  cardFingerprint?: string | null;
  currentPeriodEnd?: Date | null;
  trialEnd?: Date | null;
  canceledAt?: Date | null;
};

async function upsertSubscription(userId: string, data: SubUpsert) {
  const values = { userId, ...data };
  await db
    .insert(subscriptionsTable)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptionsTable.userId,
      set: data,
    });
}
