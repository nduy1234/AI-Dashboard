import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const leadSourcesTable = pgTable("lead_sources", {
  id: serial("id").primaryKey(),
  source: varchar("source", { length: 64 }).notNull(),
  importType: varchar("import_type", { length: 32 }).notNull().default("manual"),
  externalBatchId: varchar("external_batch_id", { length: 255 }),
  metadata: jsonb("metadata"),
  importedCount: integer("imported_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  userId: varchar("user_id"),
  orgId: integer("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadEnrichmentAttemptsTable = pgTable("lead_enrichment_attempts", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  response: jsonb("response"),
  error: text("error"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadVerificationResultsTable = pgTable("lead_verification_results", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  result: varchar("result", { length: 32 }).notNull(),
  reason: text("reason"),
  raw: jsonb("raw"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadScoresTable = pgTable("lead_scores", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  score: integer("score").notNull(),
  bucket: varchar("bucket", { length: 16 }).notNull(),
  reasons: jsonb("reasons"),
  model: varchar("model", { length: 64 }).notNull().default("heuristic-v1"),
  scoredAt: timestamp("scored_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outboundMessagesTable = pgTable("outbound_messages", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  leadId: integer("lead_id").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  messageType: varchar("message_type", { length: 32 }).notNull().default("email"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  promptVersion: varchar("prompt_version", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  externalMessageId: varchar("external_message_id", { length: 255 }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sendingEventsTable = pgTable("sending_events", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id"),
  leadId: integer("lead_id"),
  provider: varchar("provider", { length: 64 }).notNull(),
  eventType: varchar("event_type", { length: 32 }).notNull(),
  eventId: varchar("event_id", { length: 255 }).notNull(),
  payload: jsonb("payload"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerAccountsTable = pgTable("provider_accounts", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 64 }).notNull(),
  accountLabel: varchar("account_label", { length: 255 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  config: jsonb("config"),
  userId: varchar("user_id"),
  orgId: integer("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const domainPoolStateTable = pgTable("domain_pool_state", {
  id: serial("id").primaryKey(),
  domain: varchar("domain", { length: 255 }).notNull(),
  providerAccountId: integer("provider_account_id"),
  healthScore: integer("health_score").notNull().default(100),
  warmupEnabled: boolean("warmup_enabled").notNull().default(true),
  dailyLimit: integer("daily_limit").notNull().default(50),
  sentToday: integer("sent_today").notNull().default(0),
  lastWarningAt: timestamp("last_warning_at", { withTimezone: true }),
  userId: varchar("user_id"),
  orgId: integer("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const outboundJobsTable = pgTable("outbound_jobs", {
  id: serial("id").primaryKey(),
  stage: varchar("stage", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("queued"),
  campaignId: integer("campaign_id"),
  provider: varchar("provider", { length: 64 }),
  input: jsonb("input"),
  result: jsonb("result"),
  error: text("error"),
  idempotencyKey: varchar("idempotency_key", { length: 255 }),
  userId: varchar("user_id"),
  orgId: integer("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const outboundJobAttemptsTable = pgTable("outbound_job_attempts", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  attempt: integer("attempt").notNull().default(1),
  status: varchar("status", { length: 32 }).notNull(),
  error: text("error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Stores parsed inbound reply content when a prospect responds to an outbound email.
 * Populated by both the sending-provider webhooks (reply signals from Instantly/Smartlead)
 * and the inbound email webhook (POST /webhooks/inbound/:provider) for Resend forwarding.
 */
export const emailRepliesTable = pgTable("email_replies", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id"),
  leadId: integer("lead_id"),
  /** FK to sending_events.id if this reply was created from a provider webhook event */
  sendingEventId: integer("sending_event_id"),
  provider: varchar("provider", { length: 64 }).notNull(),
  fromEmail: varchar("from_email", { length: 512 }),
  subject: text("subject"),
  textBody: text("text_body"),
  htmlBody: text("html_body"),
  /**
   * Resend inbound: the email_id returned in the webhook data object.
   * Used to fetch body content from GET /emails/receiving/:email_id.
   */
  resendEmailId: varchar("resend_email_id", { length: 255 }),
  /**
   * The raw Message-ID header from the email.
   * Required for reply threading — pass as In-Reply-To header when sending a response.
   */
  messageId: varchar("message_id", { length: 512 }),
  /** Populated after AI sentiment analysis: positive | neutral | negative | unknown */
  sentiment: varchar("sentiment", { length: 32 }).notNull().default("unknown"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
