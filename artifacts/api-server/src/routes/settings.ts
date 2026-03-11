import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, apiKeysTable, promptTemplatesTable } from "@workspace/db";
import { randomBytes } from "crypto";
import {
  ListTeamMembersResponse,
  ListApiKeysResponse,
  CreateApiKeyBody,
  DeleteApiKeyParams,
  ListPromptTemplatesResponse,
  CreatePromptTemplateBody,
  UpdatePromptTemplateParams,
  UpdatePromptTemplateBody,
  UpdatePromptTemplateResponse,
  DeletePromptTemplateParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/settings/team", async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const members = users.map(u => ({
    ...u,
    role: "admin",
  }));
  res.json(ListTeamMembersResponse.parse(members));
});

router.get("/settings/api-keys", async (req, res): Promise<void> => {
  const keys = await db.select().from(apiKeysTable)
    .where(eq(apiKeysTable.userId, req.user!.id))
    .orderBy(apiKeysTable.createdAt);
  res.json(ListApiKeysResponse.parse(keys));
});

router.post("/settings/api-keys", async (req, res): Promise<void> => {
  const parsed = CreateApiKeyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const key = `ak_${randomBytes(24).toString("hex")}`;
  const [apiKey] = await db.insert(apiKeysTable).values({ name: parsed.data.name, key, userId: req.user?.id }).returning();
  res.status(201).json(apiKey);
});

router.delete("/settings/api-keys/:id", async (req, res): Promise<void> => {
  const params = DeleteApiKeyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [key] = await db.delete(apiKeysTable).where(and(eq(apiKeysTable.id, params.data.id), eq(apiKeysTable.userId, req.user!.id))).returning();
  if (!key) { res.status(404).json({ error: "API key not found" }); return; }
  res.sendStatus(204);
});

router.get("/settings/prompt-templates", async (req, res): Promise<void> => {
  const templates = await db.select().from(promptTemplatesTable)
    .where(eq(promptTemplatesTable.userId, req.user!.id))
    .orderBy(promptTemplatesTable.createdAt);
  res.json(ListPromptTemplatesResponse.parse(templates));
});

router.post("/settings/prompt-templates", async (req, res): Promise<void> => {
  const parsed = CreatePromptTemplateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [template] = await db.insert(promptTemplatesTable).values({ ...parsed.data, userId: req.user?.id }).returning();
  res.status(201).json(template);
});

router.patch("/settings/prompt-templates/:id", async (req, res): Promise<void> => {
  const params = UpdatePromptTemplateParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePromptTemplateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [template] = await db.update(promptTemplatesTable).set(parsed.data).where(and(eq(promptTemplatesTable.id, params.data.id), eq(promptTemplatesTable.userId, req.user!.id))).returning();
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(UpdatePromptTemplateResponse.parse(template));
});

router.delete("/settings/prompt-templates/:id", async (req, res): Promise<void> => {
  const params = DeletePromptTemplateParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [template] = await db.delete(promptTemplatesTable).where(and(eq(promptTemplatesTable.id, params.data.id), eq(promptTemplatesTable.userId, req.user!.id))).returning();
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  res.sendStatus(204);
});

export default router;
