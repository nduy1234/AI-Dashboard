import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    orgId: varchar("org_id"),
    stripeCustomerId: varchar("stripe_customer_id").unique(),
    stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
    /**
     * Mirrors Stripe subscription statuses.
     * trialing → active (payment ok) | past_due (payment failed) | canceled
     */
    status: varchar("status", {
      enum: ["trialing", "active", "canceled", "past_due", "unpaid", "incomplete", "incomplete_expired", "paused"],
    })
      .notNull()
      .default("trialing"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    trialEnd: timestamp("trial_end", { withTimezone: true }),
    /**
     * Stripe PaymentMethod card fingerprint — used to detect duplicate trials
     * across multiple accounts (anti-abuse).
     */
    cardFingerprint: varchar("card_fingerprint"),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One active subscription row per user — unique so we can upsert
    unique("subscriptions_user_id_unique").on(table.userId),
    index("idx_subscriptions_user_id").on(table.userId),
    index("idx_subscriptions_stripe_customer").on(table.stripeCustomerId),
    index("idx_subscriptions_stripe_sub").on(table.stripeSubscriptionId),
    // Needed for the anti-abuse fingerprint check (fast look-up)
    index("idx_subscriptions_card_fingerprint").on(table.cardFingerprint),
  ],
);

export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertSubscription = typeof subscriptionsTable.$inferInsert;

export type SubscriptionStatus = NonNullable<
  typeof subscriptionsTable.$inferSelect.status
>;
