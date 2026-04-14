import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Tracks background HubSpot scan jobs initiated from the Reactivation page.
 * One row per scan run; status transitions: queued → running → completed | failed.
 */
export const reactivationScanJobsTable = pgTable("reactivation_scan_jobs", {
  id: serial("id").primaryKey(),
  status: varchar("status", { length: 32 }).notNull().default("queued"),
  /** Serialized import filters (inactivityDays, dealStage, minDealValue, etc.) */
  filters: jsonb("filters"),
  totalFound: integer("total_found").notNull().default(0),
  imported: integer("imported").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  excluded: integer("excluded").notNull().default(0),
  error: text("error"),
  userId: varchar("user_id"),
  orgId: integer("org_id"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tracks the per-lead state of a multi-step reactivation email sequence.
 * Each campaign × lead pair has one row per sequence step.
 * Status transitions: pending → sent | skipped.
 */
export const campaignSequenceStepsTable = pgTable(
  "campaign_sequence_steps",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull(),
    leadId: integer("lead_id").notNull(),
    stepNumber: integer("step_number").notNull(),
    /** Days after launch to send this step (0 = immediate) */
    delayDays: integer("delay_days").notNull().default(0),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    outboundMessageId: integer("outbound_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("css_campaign_lead_idx").on(t.campaignId, t.leadId),
    index("css_campaign_id_idx").on(t.campaignId),
    index("css_lead_id_idx").on(t.leadId),
  ],
);

export type ReactivationScanJob = typeof reactivationScanJobsTable.$inferSelect;
export type CampaignSequenceStep = typeof campaignSequenceStepsTable.$inferSelect;
