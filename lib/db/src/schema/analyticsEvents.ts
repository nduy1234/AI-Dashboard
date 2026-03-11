import { pgTable, serial, varchar, integer, timestamp, jsonb, text } from "drizzle-orm/pg-core";

export const analyticsEventsTable = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEventsTable.$inferInsert;
