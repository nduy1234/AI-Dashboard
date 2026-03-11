import { pgTable, serial, varchar, integer, boolean, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailAccountsTable = pgTable("email_accounts", {
  id: serial("id").primaryKey(),
  email: varchar("email").notNull(),
  provider: varchar("provider").notNull(),
  status: varchar("status").notNull().default("active"),
  dailyLimit: integer("daily_limit").notNull().default(50),
  sentToday: integer("sent_today").notNull().default(0),
  warmupEnabled: boolean("warmup_enabled").notNull().default(false),
  reputation: doublePrecision("reputation").notNull().default(100),
  userId: varchar("user_id"),
  orgId: integer("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmailAccountSchema = createInsertSchema(emailAccountsTable).omit({ id: true, createdAt: true });
export type InsertEmailAccount = z.infer<typeof insertEmailAccountSchema>;
export type EmailAccount = typeof emailAccountsTable.$inferSelect;
