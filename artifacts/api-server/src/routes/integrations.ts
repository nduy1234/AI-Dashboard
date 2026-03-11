import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, integrationsTable } from "@workspace/db";
import {
  ListIntegrationsResponse,
  UpdateIntegrationParams,
  UpdateIntegrationBody,
  UpdateIntegrationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/integrations", async (req, res): Promise<void> => {
  const integrations = await db.select().from(integrationsTable)
    .where(eq(integrationsTable.userId, req.user!.id))
    .orderBy(integrationsTable.name);
  res.json(ListIntegrationsResponse.parse(integrations));
});

router.patch("/integrations/:id", async (req, res): Promise<void> => {
  const params = UpdateIntegrationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateIntegrationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { apiKey, ...updateData } = parsed.data;
  const setData: Record<string, unknown> = { ...updateData };
  if (apiKey) setData.apiKeyConfigured = true;
  const [integration] = await db.update(integrationsTable).set(setData).where(and(eq(integrationsTable.id, params.data.id), eq(integrationsTable.userId, req.user!.id))).returning();
  if (!integration) { res.status(404).json({ error: "Integration not found" }); return; }
  res.json(UpdateIntegrationResponse.parse(integration));
});

export default router;
