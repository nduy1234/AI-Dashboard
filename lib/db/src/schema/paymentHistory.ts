import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, timestamp, unique, varchar } from "drizzle-orm/pg-core";

/**
 * Immutable audit log of every Stripe event that touches billing.
 *
 * - stripeEventId is UNIQUE → natural idempotency key.
 *   If Stripe retries a webhook, the INSERT will conflict and be ignored.
 * - Never UPDATE or DELETE rows from this table.
 */
export const paymentHistoryTable = pgTable(
  "payment_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    stripeEventId: varchar("stripe_event_id").notNull(),
    stripeCustomerId: varchar("stripe_customer_id"),
    stripeSubscriptionId: varchar("stripe_subscription_id"),
    /** Stripe event type: checkout.session.completed, invoice.payment_succeeded … */
    eventType: varchar("event_type").notNull(),
    /** Amount charged in smallest currency unit (cents). Null for non-payment events. */
    amountPaid: integer("amount_paid"),
    currency: varchar("currency", { length: 3 }),
    /** succeeded | failed | refunded | blocked */
    status: varchar("status").notNull().default("succeeded"),
    /** Raw Stripe event data for debugging / compliance */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotency: reject duplicate Stripe event replays
    unique("payment_history_stripe_event_id_unique").on(table.stripeEventId),
    index("idx_payment_history_user_id").on(table.userId),
    index("idx_payment_history_customer").on(table.stripeCustomerId),
    index("idx_payment_history_created_at").on(table.createdAt),
  ],
);

export type PaymentHistory = typeof paymentHistoryTable.$inferSelect;
export type InsertPaymentHistory = typeof paymentHistoryTable.$inferInsert;
