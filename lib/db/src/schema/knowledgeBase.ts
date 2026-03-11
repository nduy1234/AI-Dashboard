import { pgTable, serial, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const knowledgeBaseDocsTable = pgTable("knowledge_base_docs", {
  id: serial("id").primaryKey(),
  title: varchar("title").notNull(),
  type: varchar("type").notNull(),
  content: text("content").notNull(),
  userId: varchar("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKnowledgeBaseDocSchema = createInsertSchema(knowledgeBaseDocsTable).omit({ id: true, createdAt: true });
export type InsertKnowledgeBaseDoc = z.infer<typeof insertKnowledgeBaseDocSchema>;
export type KnowledgeBaseDoc = typeof knowledgeBaseDocsTable.$inferSelect;
