import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  memberId: varchar("member_id").notNull(),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamMember = typeof teamMembersTable.$inferSelect;
export type InsertTeamMember = typeof teamMembersTable.$inferInsert;
