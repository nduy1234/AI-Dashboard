import { pgTable, serial, text, varchar, integer, boolean, timestamp, doublePrecision, index } from "drizzle-orm/pg-core";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email").notNull(),
  company: varchar("company").notNull(),
  title: varchar("title").notNull(),
  status: varchar("status").notNull().default("new"),
  source: varchar("source").notNull(),
  industry: varchar("industry"),
  companySize: varchar("company_size"),
  engagementScore: integer("engagement_score"),
  lastContactDate: timestamp("last_contact_date", { withTimezone: true }),
  verified: boolean("verified").notNull().default(false),
  phone: varchar("phone"),
  linkedinUrl: varchar("linkedin_url"),
  dealStage: varchar("deal_stage"),
  dealValue: doublePrecision("deal_value"),
  notes: text("notes"),
  /** External CRM record ID (e.g. HubSpot deal/contact ID) — used for dedup and sync */
  crmId: varchar("crm_id"),
  /** Reason the deal was originally lost, sourced from the CRM during reactivation scan */
  lostReason: text("lost_reason"),
  userId: varchar("user_id"),
  orgId: integer("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("leads_email_idx").on(t.email),
  index("leads_crm_id_idx").on(t.crmId),
]);

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
