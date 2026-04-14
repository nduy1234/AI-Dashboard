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
import { loadApolloEndpointsConfig } from "@workspace/agent-orchestration";
import { testHubspotConnection } from "../lib/hubspotClient";

const router: IRouter = Router();

function ownerFilter(req: Express.Request) {
  return ownerScope(integrationsTable, getOwnerContext(req));
}

router.get("/integrations", async (req, res): Promise<void> => {
  const integrations = await db.select().from(integrationsTable)
    .where(ownerFilter(req))
    .orderBy(integrationsTable.name);

  const normalized = integrations.map((i) => {
    const rawConfig = (i.config ?? {}) as Record<string, unknown>;

    // Strip the raw apiKey from all integration configs before sending to the
    // frontend — replace with a masked token hint so the UI can show which key
    // is active without exposing the secret.
    const { apiKey, ...safeConfig } = rawConfig as { apiKey?: string; [k: string]: unknown };
    const configForClient: Record<string, unknown> | undefined =
      Object.keys(rawConfig).length > 0
        ? {
            ...safeConfig,
            ...(apiKey
              ? { maskedToken: `${apiKey.slice(0, 10)}…${apiKey.slice(-4)}` }
              : {}),
          }
        : undefined;

    return {
      ...i,
      config:     configForClient,
      lastSyncAt: i.lastSyncAt ?? undefined,
    };
  });

  res.json(ListIntegrationsResponse.parse(normalized));
});

/**
 * GET /api/v1/integrations/apollo/endpoints
 * Returns the allowed Apollo API paths from lib/agent-orchestration/config/apollo-endpoints.json
 * (no API keys). Edit that file to match your Apollo plan.
 */
router.get("/integrations/apollo/endpoints", async (req, res): Promise<void> => {
  const owner = getOwnerContext(req);
  if (!owner) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    res.json(loadApolloEndpointsConfig());
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : "Failed to load Apollo endpoints config",
    });
  }
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

/**
 * POST /api/v1/integrations/hubspot/connect
 * Validates a HubSpot Private App Token, then stores status + portal metadata
 * on the hubspot integration row for the current owner.
 * Body: { apiKey: string }
 */
router.post("/integrations/hubspot/connect", async (req, res): Promise<void> => {
  try {
    const owner = getOwnerContext(req);
    const { apiKey } = req.body as { apiKey?: string };

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
      res.status(400).json({ ok: false, error: "A valid HubSpot Private App Token is required" });
      return;
    }

    const result = await testHubspotConnection(apiKey.trim());

    if (!result.ok) {
      // Persist error status so the UI can show "Reconnect"
      await db
        .update(integrationsTable)
        .set({ status: "error", lastSyncAt: new Date() })
        .where(and(eq(integrationsTable.type, "hubspot"), ownerScope(integrationsTable, owner)));

      res.status(400).json({ ok: false, error: result.error });
      return;
    }

    const [integration] = await db
      .update(integrationsTable)
      .set({
        status: "connected",
        apiKeyConfigured: true,
        lastSyncAt: new Date(),
        config: {
          portalId: result.portalId,
          hubDomain: result.hubDomain,
          /** Store token so background scan jobs can read it */
          apiKey: apiKey.trim(),
          dailyOutreachLimit: 100,
        },
      })
      .where(and(eq(integrationsTable.type, "hubspot"), ownerScope(integrationsTable, owner)))
      .returning();

    if (!integration) {
      res.status(404).json({ ok: false, error: "HubSpot integration record not found — run the seed script" });
      return;
    }

    res.json({
      ok: true,
      integration: UpdateIntegrationResponse.parse({ ...integration, config: undefined }),
      portalId: result.portalId,
      hubDomain: result.hubDomain,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "HubSpot connectivity test failed",
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
