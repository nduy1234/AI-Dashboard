/**
 * Agent-related database schema extensions
 * Additions to support autonomous agent orchestration
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  decimal,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Store each decision made by agent during a run
 */
export const agentDecisionsTable = pgTable(
  "agent_decisions",
  {
    id: serial("id").primaryKey(),
    agentId: varchar("agent_id").notNull(),
    agentType: varchar("agent_type").notNull(), // "outbound"
    campaignId: integer("campaign_id").notNull(),
    orgId: integer("org_id").notNull(),
    iteration: integer("iteration").notNull(),
    action: varchar("action").notNull(), // "import", "enrich", "verify", "personalize", "send", etc.
    toolsTried: jsonb("tools_tried").notNull(), // ["apollo", "clay"]
    reasoning: text("reasoning"),
    confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0.00 - 1.00
    resultStatus: varchar("result_status"), // "pending", "success", "failed"
    resultData: jsonb("result_data"), // Result metadata
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idx_agent_campaign: uniqueIndex("idx_agent_campaign_iteration").on(
      table.agentId,
      table.campaignId,
      table.iteration,
    ),
  }),
);

export const insertAgentDecisionSchema = createInsertSchema(agentDecisionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentDecision = z.infer<typeof insertAgentDecisionSchema>;
export type AgentDecision = typeof agentDecisionsTable.$inferSelect;

/**
 * Store agent's learned patterns and conversation memory
 */
export const agentMemoryTable = pgTable("agent_memory", {
  id: serial("id").primaryKey(),
  agentType: varchar("agent_type").notNull(),
  campaignId: integer("campaign_id").notNull(),
  orgId: integer("org_id").notNull(),
  topic: varchar("topic").notNull(), // "lead_quality", "tool_performance", "strategy"
  content: text("content").notNull(), // Serialized memory (JSON)
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentMemorySchema = createInsertSchema(agentMemoryTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentMemory = z.infer<typeof insertAgentMemorySchema>;
export type AgentMemory = typeof agentMemoryTable.$inferSelect;

/**
 * Campaign webhook signals (opens, clicks, replies, bounces)
 * Used by agent to learn and adjust strategy
 */
export const campaignSignalsTable = pgTable(
  "campaign_signals",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull(),
    leadId: integer("lead_id"),
    signalType: varchar("signal_type").notNull(), // "open", "click", "reply", "positive_reply", "bounce", "unsubscribe"
    value: integer("value"), // 1 for yes, 0 for no (for aggregations)
    externalId: varchar("external_id"), // From webhook (e.g., Resend message ID)
    metadata: jsonb("metadata"), // Extra context
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idx_campaign_signal: uniqueIndex("idx_campaign_signal_type").on(
      table.campaignId,
      table.signalType,
    ),
  }),
);

export const insertCampaignSignalSchema = createInsertSchema(campaignSignalsTable).omit({
  id: true,
  recordedAt: true,
});
export type InsertCampaignSignal = z.infer<typeof insertCampaignSignalSchema>;
export type CampaignSignal = typeof campaignSignalsTable.$inferSelect;

/**
 * Immutable spend ledger (audit trail for MCP spend guards)
 * Every transaction recorded here + verified against guards
 */
export const spendLedgerTable = pgTable(
  "spend_ledger",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull(),
    campaignId: integer("campaign_id"),
    action: varchar("action").notNull(), // "email_sent", "lead_enriched", "api_call"
    amountUsd: decimal("amount_usd", { precision: 10, scale: 4 }).notNull(),
    guardApplied: varchar("guard_applied"), // "budget", "rate_limit", "recipient", "none"
    guardStatus: varchar("guard_status"), // "allowed", "rejected", "warning"
    agentId: varchar("agent_id"), // Which agent triggered spend
    toolUsed: varchar("tool_used"), // "clay", "resend", etc.
    metadata: jsonb("metadata"), // Full context
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idx_org_campaign: uniqueIndex("idx_spend_org_campaign").on(table.orgId, table.campaignId),
  }),
);

export const insertSpendLedgerSchema = createInsertSchema(spendLedgerTable).omit({
  id: true,
  recordedAt: true,
});
export type InsertSpendLedger = z.infer<typeof insertSpendLedgerSchema>;
export type SpendLedger = typeof spendLedgerTable.$inferSelect;

/**
 * Trust gate and reputation data (from ERC-8004)
 * Cached locally for fast lookups by agent
 */
export const agentTrustScoresTable = pgTable(
  "agent_trust_scores",
  {
    id: serial("id").primaryKey(),
    agentId: varchar("agent_id").notNull(),
    trustScore: decimal("trust_score", { precision: 5, scale: 4 }), // 0.0000 - 1.0000
    weightedTrustScore: integer("weighted_trust_score"), // 0 - 1000
    reputationSignals: integer("reputation_signals"), // Count
    onChainRegistered: boolean("on_chain_registered").default(false),
    erc8004Address: varchar("erc8004_address"), // If registered on-chain
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idx_agent_id: uniqueIndex("idx_trust_agent_id").on(table.agentId),
  }),
);

export const insertAgentTrustScoreSchema = createInsertSchema(agentTrustScoresTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertAgentTrustScore = z.infer<typeof insertAgentTrustScoreSchema>;
export type AgentTrustScore = typeof agentTrustScoresTable.$inferSelect;
