import { pgTable, serial, varchar, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentLogsTable = pgTable("agent_logs", {
  id: serial("id").primaryKey(),
  agentType: varchar("agent_type").notNull(),
  action: varchar("action").notNull(),
  status: varchar("status").notNull(),
  details: text("details"),
  metadata: jsonb("metadata"),
  userId: varchar("user_id"),
  orgId: integer("org_id"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentLogSchema = createInsertSchema(agentLogsTable).omit({ id: true, timestamp: true });
export type InsertAgentLog = z.infer<typeof insertAgentLogSchema>;
export type AgentLog = typeof agentLogsTable.$inferSelect;
