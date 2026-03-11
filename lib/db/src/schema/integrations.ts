import { pgTable, serial, varchar, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(),
  status: varchar("status").notNull().default("disconnected"),
  category: varchar("category").notNull(),
  description: text("description"),
  apiKeyConfigured: boolean("api_key_configured").notNull().default(false),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  config: jsonb("config"),
  userId: varchar("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIntegrationSchema = createInsertSchema(integrationsTable).omit({ id: true, createdAt: true });
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type Integration = typeof integrationsTable.$inferSelect;
