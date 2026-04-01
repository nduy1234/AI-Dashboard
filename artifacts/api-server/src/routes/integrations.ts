import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, integrationsTable } from "@workspace/db";
import {
  ListIntegrationsResponse,
  UpdateIntegrationParams,
  UpdateIntegrationBody,
  UpdateIntegrationResponse,
} from "@workspace/api-zod";
import { getOwnerContext, ownerScope } from "../security/ownerContext";
import { testSlackConnection } from "../lib/slackClient";
import { testCalcomConnection } from "../lib/calcomClient";

const router: IRouter = Router();

function ownerFilter(req: Express.Request) {
  return ownerScope(integrationsTable, getOwnerContext(req));
}

router.get("/integrations", async (req, res): Promise<void> => {
  const integrations = await db.select().from(integrationsTable)
    .where(ownerFilter(req))
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
  const [integration] = await db.update(integrationsTable).set(setData).where(and(eq(integrationsTable.id, params.data.id), ownerFilter(req))).returning();
  if (!integration) { res.status(404).json({ error: "Integration not found" }); return; }
  res.json(UpdateIntegrationResponse.parse(integration));
});

router.post("/integrations/slack/test", async (req, res): Promise<void> => {
  try {
    const owner = getOwnerContext(req);
    const status = await testSlackConnection();

    const [integration] = await db
      .update(integrationsTable)
      .set({
        status: "connected",
        apiKeyConfigured: Boolean(process.env.SLACK_WEBHOOK_URL || process.env.SLACK_BOT_TOKEN),
        lastSyncAt: new Date(),
        config: {
          mode: status.mode,
          channel: process.env.SLACK_NOTIFY_CHANNEL ?? "#outbound-alerts",
          team: status.team ?? null,
        },
      })
      .where(and(eq(integrationsTable.type, "slack"), ownerScope(integrationsTable, owner)))
      .returning();

    if (!integration) {
      res.status(404).json({ error: "Slack integration record not found for current owner" });
      return;
    }

    res.json({
      ok: true,
      integration: UpdateIntegrationResponse.parse(integration),
      status,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Slack connectivity test failed",
    });
  }
});

router.post("/integrations/calcom/test", async (req, res): Promise<void> => {
  try {
    const owner = getOwnerContext(req);
    await testCalcomConnection();

    const [integration] = await db
      .update(integrationsTable)
      .set({
        status: "connected",
        apiKeyConfigured: Boolean(process.env.CALCOM_API_KEY),
        lastSyncAt: new Date(),
      })
      .where(and(eq(integrationsTable.type, "calcom"), ownerScope(integrationsTable, owner)))
      .returning();

    if (!integration) {
      res.status(404).json({ error: "Cal.com integration record not found for current owner" });
      return;
    }

    res.json({
      ok: true,
      integration: UpdateIntegrationResponse.parse(integration),
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Cal.com connectivity test failed",
    });
  }
});

export default router;
