import { sql } from "drizzle-orm";
import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  domain: varchar("domain", { length: 255 }),
  ownerId: varchar("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Organization = typeof organizationsTable.$inferSelect;
export type InsertOrganization = typeof organizationsTable.$inferInsert;

export const orgMembershipsTable = pgTable("org_memberships", {
  id: serial("id").primaryKey(),
  orgId: serial("org_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrgMembership = typeof orgMembershipsTable.$inferSelect;
export type InsertOrgMembership = typeof orgMembershipsTable.$inferInsert;
