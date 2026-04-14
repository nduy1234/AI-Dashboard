import Stripe from "stripe";
import { db, subscriptionsTable, usersTable, paymentHistoryTable } from "@workspace/db";
import { eq, ne, and } from "drizzle-orm";

type SubscriptionStatus = NonNullable<typeof subscriptionsTable.$inferSelect.status>;

// ---------------------------------------------------------------------------
// Stripe client (lazy singleton)
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

  // Reuse existing Stripe customer to avoid duplicate customers
  let stripeCustomerId: string | undefined;
  const [existingUser] = await db
    .select({ stripeCustomerId: usersTable.stripeCustomerId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (existingUser?.stripeCustomerId) {
    stripeCustomerId = existingUser.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email: userEmail ?? undefined,
      metadata: { userId },
    });
    stripeCustomerId = customer.id;
    // Persist immediately so parallel requests reuse the same customer
    await db
      .update(usersTable)
      .set({ stripeCustomerId })
      .where(eq(usersTable.id, userId));
  }

  return stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    payment_method_collection: "always",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { userId },
    },
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
  });
}

/**
 * Creates a Stripe Billing Portal session for self-service subscription management.
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
// User status read
// ---------------------------------------------------------------------------

export async function getUserProStatus(userId: string) {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
      isPro: usersTable.isPro,
      subscriptionExpiry: usersTable.subscriptionExpiry,
      stripeCustomerId: usersTable.stripeCustomerId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

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

function customerId(
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function getPeriodEnd(sub: Stripe.Subscription): number | null {
  return sub.items?.data?.[0]?.current_period_end ?? null;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent as Stripe.Invoice.Parent | null;
  if (!parent) return null;
  const sd = parent.subscription_details as Stripe.Invoice.Parent.SubscriptionDetails | null;
  if (!sd) return null;
  return subId(sd.subscription as string | Stripe.Subscription | null);
}

/** A user is "pro" when their subscription is live (trialing counts as pro). */
function isProStatus(status: SubscriptionStatus): boolean {
  return status === "trialing" || status === "active";
}

// ---------------------------------------------------------------------------
// Idempotent event recorder
// ---------------------------------------------------------------------------

/**
 * Attempts to insert a payment_history row for this Stripe event.
 * Returns `false` if the event was already processed (idempotency).
 */
async function recordEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  opts: {
    stripeEventId: string;
    userId: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    eventType: string;
    amountPaid?: number | null;
    currency?: string | null;
    status?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  try {
    await tx.insert(paymentHistoryTable).values({
      stripeEventId: opts.stripeEventId,
      userId: opts.userId,
      stripeCustomerId: opts.stripeCustomerId ?? null,
      stripeSubscriptionId: opts.stripeSubscriptionId ?? null,
      eventType: opts.eventType,
      amountPaid: opts.amountPaid ?? null,
      currency: opts.currency ?? null,
      status: opts.status ?? "succeeded",
      metadata: opts.metadata ?? null,
    });
    return true;
  } catch {
    // UNIQUE constraint on stripe_event_id → already processed
    return false;
  }
}

// ---------------------------------------------------------------------------
// Webhook handlers — all wrapped in atomic DB transactions
// ---------------------------------------------------------------------------

/**
 * `checkout.session.completed`
 *
 * Atomic transaction:
 *  1. Idempotency check via payment_history
 *  2. Anti-abuse card-fingerprint check
 *  3. Upsert subscriptions row
 *  4. Flip users.is_pro = true (trial is paid access)
 *  5. Update users.stripe_customer_id for fast future look-ups
 */
export async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
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

  // Resolve card fingerprint
  let cardFingerprint: string | null = null;
  const pmRef = stripeSub.default_payment_method;
  if (pmRef) {
    try {
      const pm = await stripe.paymentMethods.retrieve(
        typeof pmRef === "string" ? pmRef : pmRef.id,
      );
      cardFingerprint = pm.card?.fingerprint ?? null;
    } catch (err) {
      console.warn("[Billing] Could not retrieve payment method fingerprint:", err);
    }
  }

  await db.transaction(async (tx) => {
    // --- Idempotency ---
    const isNew = await recordEvent(tx, {
      stripeEventId: event.id,
      userId,
      stripeCustomerId: cId,
      stripeSubscriptionId: sId,
      eventType: event.type,
      metadata: { sessionId: session.id, subscriptionStatus: stripeSub.status },
    });
    if (!isNew) {
      console.log(`[Billing] Duplicate event skipped: ${event.id}`);
      return;
    }

    // --- Anti-abuse fingerprint check ---
    if (cardFingerprint) {
      const [fraudRecord] = await tx
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
          `[Billing] Duplicate trial BLOCKED — fingerprint=${cardFingerprint} ` +
            `existing_user=${fraudRecord.userId} attacker=${userId}`,
        );
        // Cancel silently — don't flip isPro
        await stripe.subscriptions.cancel(sId);
        await tx.insert(subscriptionsTable).values({
          userId, stripeCustomerId: cId, stripeSubscriptionId: sId,
          status: "canceled", cardFingerprint, canceledAt: new Date(),
          currentPeriodEnd: toDate(getPeriodEnd(stripeSub)),
          trialEnd: toDate(stripeSub.trial_end ?? null),
        }).onConflictDoUpdate({
          target: subscriptionsTable.userId,
          set: { status: "canceled", cardFingerprint, canceledAt: new Date() },
        });
        return;
      }
    }

    const status = stripeSub.status as SubscriptionStatus;

    // --- Upsert subscriptions ---
    await tx.insert(subscriptionsTable).values({
      userId, stripeCustomerId: cId, stripeSubscriptionId: sId,
      status, cardFingerprint,
      currentPeriodEnd: toDate(getPeriodEnd(stripeSub)),
      trialEnd: toDate(stripeSub.trial_end ?? null),
      canceledAt: toDate(stripeSub.canceled_at ?? null),
    }).onConflictDoUpdate({
      target: subscriptionsTable.userId,
      set: {
        stripeCustomerId: cId, stripeSubscriptionId: sId,
        status, cardFingerprint,
        currentPeriodEnd: toDate(getPeriodEnd(stripeSub)),
        trialEnd: toDate(stripeSub.trial_end ?? null),
        canceledAt: toDate(stripeSub.canceled_at ?? null),
      },
    });

    // --- Flip isPro on users (trial = full access) ---
    await tx.update(usersTable).set({
      isPro: isProStatus(status),
      subscriptionExpiry: toDate(getPeriodEnd(stripeSub)),
      stripeCustomerId: cId,
    }).where(eq(usersTable.id, userId));
  });

  console.log(`[Billing] checkout.session.completed processed userId=${userId} status=${stripeSub.status}`);
}

/**
 * `customer.subscription.updated` / `customer.subscription.created`
 *
 * Keeps subscriptions + users.is_pro in sync with Stripe.
 */
export async function handleSubscriptionUpdated(
  event: Stripe.Event,
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = subscription.metadata?.userId;
  const status = subscription.status as SubscriptionStatus;

  await db.transaction(async (tx) => {
    const isNew = userId
      ? await recordEvent(tx, {
          stripeEventId: event.id,
          userId,
          stripeSubscriptionId: subscription.id,
          eventType: event.type,
          metadata: { status },
        })
      : true; // no userId in metadata — still process but don't record

    if (!isNew) {
      console.log(`[Billing] Duplicate event skipped: ${event.id}`);
      return;
    }

    const periodEnd = toDate(getPeriodEnd(subscription));
    const trialEnd  = toDate(subscription.trial_end ?? null);
    const canceledAt = toDate(subscription.canceled_at ?? null);

    await tx.update(subscriptionsTable).set({
      status, currentPeriodEnd: periodEnd, trialEnd, canceledAt,
    }).where(eq(subscriptionsTable.stripeSubscriptionId, subscription.id));

    if (userId) {
      await tx.update(usersTable).set({
        isPro: isProStatus(status),
        subscriptionExpiry: periodEnd,
      }).where(eq(usersTable.id, userId));
    } else {
      // Fall back: look up user via subscriptions table join
      const [sub] = await tx
        .select({ userId: subscriptionsTable.userId })
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.stripeSubscriptionId, subscription.id));
      if (sub) {
        await tx.update(usersTable).set({
          isPro: isProStatus(status),
          subscriptionExpiry: periodEnd,
        }).where(eq(usersTable.id, sub.userId));
      }
    }
  });

  console.log(`[Billing] Subscription ${subscription.id} → ${status}`);
}

/**
 * `invoice.payment_succeeded`
 *
 * Trial converted to paid. Sets status=active and isPro=true.
 */
export async function handleInvoicePaymentSucceeded(
  event: Stripe.Event,
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const sId = getInvoiceSubscriptionId(invoice);
  if (!sId) return;

  const amountPaid =
    typeof (invoice as unknown as Record<string, unknown>).amount_paid === "number"
      ? (invoice as unknown as Record<string, number>).amount_paid
      : null;

  await db.transaction(async (tx) => {
    const [sub] = await tx
      .select({ userId: subscriptionsTable.userId })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.stripeSubscriptionId, sId));

    const userId = sub?.userId;

    if (userId) {
      const isNew = await recordEvent(tx, {
        stripeEventId: event.id,
        userId,
        stripeSubscriptionId: sId,
        stripeCustomerId: customerId(
          (invoice as unknown as { customer?: string }).customer ?? null,
        ),
        eventType: event.type,
        amountPaid,
        currency: typeof (invoice as unknown as Record<string, unknown>).currency === "string"
          ? (invoice as unknown as Record<string, string>).currency
          : null,
        status: "succeeded",
        metadata: { invoiceId: (invoice as unknown as { id?: string }).id },
      });
      if (!isNew) {
        console.log(`[Billing] Duplicate event skipped: ${event.id}`);
        return;
      }
    }

    await tx.update(subscriptionsTable)
      .set({ status: "active" })
      .where(eq(subscriptionsTable.stripeSubscriptionId, sId));

    if (userId) {
      await tx.update(usersTable)
        .set({ isPro: true })
        .where(eq(usersTable.id, userId));
    }
  });

  console.log(`[Billing] Invoice payment succeeded — subscription=${sId} → active + isPro=true`);
}

/**
 * `invoice.payment_failed`
 *
 * Payment failed — set past_due and revoke pro access.
 */
export async function handleInvoicePaymentFailed(
  event: Stripe.Event,
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const sId = getInvoiceSubscriptionId(invoice);
  if (!sId) return;

  await db.transaction(async (tx) => {
    const [sub] = await tx
      .select({ userId: subscriptionsTable.userId })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.stripeSubscriptionId, sId));

    const userId = sub?.userId;

    if (userId) {
      const isNew = await recordEvent(tx, {
        stripeEventId: event.id,
        userId,
        stripeSubscriptionId: sId,
        eventType: event.type,
        status: "failed",
        metadata: { invoiceId: (invoice as unknown as { id?: string }).id },
      });
      if (!isNew) {
        console.log(`[Billing] Duplicate event skipped: ${event.id}`);
        return;
      }
    }

    await tx.update(subscriptionsTable)
      .set({ status: "past_due" })
      .where(eq(subscriptionsTable.stripeSubscriptionId, sId));

    if (userId) {
      await tx.update(usersTable)
        .set({ isPro: false })
        .where(eq(usersTable.id, userId));
    }
  });

  console.log(`[Billing] Invoice payment FAILED — subscription=${sId} → past_due + isPro=false`);
}
