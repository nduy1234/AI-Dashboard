import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, knowledgeBaseDocsTable } from "@workspace/db";
import {
  ListKnowledgeBaseResponse,
  CreateKnowledgeBaseDocBody,
  DeleteKnowledgeBaseDocParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/knowledge-base", async (req, res): Promise<void> => {
  const docs = await db.select().from(knowledgeBaseDocsTable)
    .where(eq(knowledgeBaseDocsTable.userId, req.user!.id))
    .orderBy(knowledgeBaseDocsTable.createdAt);
  res.json(ListKnowledgeBaseResponse.parse(docs));
});

router.post("/knowledge-base", async (req, res): Promise<void> => {
  const parsed = CreateKnowledgeBaseDocBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [doc] = await db.insert(knowledgeBaseDocsTable).values({ ...parsed.data, userId: req.user?.id }).returning();
  res.status(201).json(doc);
});

router.delete("/knowledge-base/:id", async (req, res): Promise<void> => {
  const params = DeleteKnowledgeBaseDocParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [doc] = await db.delete(knowledgeBaseDocsTable).where(and(eq(knowledgeBaseDocsTable.id, params.data.id), eq(knowledgeBaseDocsTable.userId, req.user!.id))).returning();
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  res.sendStatus(204);
});

export default router;
