import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, campaignsTable, campaignLeadsTable } from "@workspace/db";
import {
  ListCampaignsResponse,
  CreateCampaignBody,
  GetCampaignParams,
  GetCampaignResponse,
  UpdateCampaignParams,
  UpdateCampaignBody,
  UpdateCampaignResponse,
  DeleteCampaignParams,
  LaunchCampaignParams,
  LaunchCampaignResponse,
  PauseCampaignParams,
  PauseCampaignResponse,
} from "@workspace/api-zod";
import { getOwnerContext, ownerScope } from "../security/ownerContext";
import { launchAgentForCampaign } from "../agentLauncher.js";
import { pipelineEmitter, type PipelineStepEvent } from "../lib/pipelineEmitter.js";

const router: IRouter = Router();

function campaignOwnerFilter(req: Express.Request) {
  return ownerScope(campaignsTable, getOwnerContext(req));
}

router.get("/campaigns", async (req, res): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const conditions = [];
    conditions.push(campaignOwnerFilter(req));
    if (req.query.type && typeof req.query.type === "string") {
      conditions.push(eq(campaignsTable.type, req.query.type));
    }
    if (req.query.status && typeof req.query.status === "string") {
      conditions.push(eq(campaignsTable.status, req.query.status));
    }

    const campaigns = await db.select().from(campaignsTable)
      .where(and(...conditions))
      .orderBy(campaignsTable.createdAt);

    console.log(`[Campaign] GET /campaigns: found ${campaigns.length} campaigns for user ${req.user.id} (orgId: ${req.orgId})`);
    res.json(ListCampaignsResponse.parse(campaigns));
  } catch (error) {
    console.error(`[Campaign] GET /campaigns error:`, error instanceof Error ? error.message : String(error));
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch campaigns",
    });
  }
});

router.post("/campaigns", async (req, res): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const parsed = CreateCampaignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { leadIds, emailSequence, ...campaignData } = parsed.data;
    console.log(`[Campaign] Creating campaign with data:`, { campaignData, userId: req.user.id, orgId: req.orgId });

    const campaign = await db.insert(campaignsTable).values({
      ...campaignData,
      emailSequenceCount: emailSequence?.length ?? 0,
      leadCount: leadIds?.length ?? 0,
      userId: req.user.id,
      orgId: req.orgId,
    }).returning();

    if (!campaign || campaign.length === 0) {
      res.status(500).json({ error: "Failed to create campaign: no rows returned" });
      return;
    }

    const createdCampaign = campaign[0];
    console.log(`[Campaign] Campaign created with ID ${createdCampaign.id}`);

    // Link provided leads to this campaign so the agent starts with a pre-populated batch
    if (leadIds && leadIds.length > 0) {
      await db.insert(campaignLeadsTable).values(
        leadIds.map((leadId) => ({ campaignId: createdCampaign.id, leadId, status: "pending" })),
      );
      console.log(`[Campaign] Linked ${leadIds.length} leads to campaign ${createdCampaign.id}`);
    }

    // Auto-start the agent so campaign creation is the single "launch" click.
    // The agent runs in the background; the 201 response returns immediately.
    launchAgentForCampaign({
      campaignId:    createdCampaign.id,
      owner:         { userId: req.user.id, orgId: req.orgId ?? null },
      maxIterations: 10,
      enableLearning: true,
    }).catch((err) => {
      console.error(`[Campaign] Failed to auto-start agent for campaign ${createdCampaign.id}:`, err instanceof Error ? err.message : String(err));
    });

    res.status(201).json(GetCampaignResponse.parse(createdCampaign));
  } catch (error) {
    console.error(`[Campaign] POST /campaigns error:`, error instanceof Error ? error.message : String(error));
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create campaign",
    });
  }
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const params = GetCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const campaign = await db.select().from(campaignsTable).where(and(eq(campaignsTable.id, params.data.id), campaignOwnerFilter(req)));
    if (!campaign || campaign.length === 0) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    res.json(GetCampaignResponse.parse(campaign[0]));
  } catch (error) {
    console.error(`[Campaign] GET /campaigns/:id error:`, error instanceof Error ? error.message : String(error));
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch campaign",
    });
  }
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const params = UpdateCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateCampaignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { emailSequence, ...updateData } = parsed.data;
    const setData: Record<string, unknown> = { ...updateData };
    if (emailSequence) setData.emailSequenceCount = emailSequence.length;

    const campaign = await db.update(campaignsTable).set(setData).where(and(eq(campaignsTable.id, params.data.id), campaignOwnerFilter(req))).returning();
    if (!campaign || campaign.length === 0) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    console.log(`[Campaign] Updated campaign ${params.data.id}`);
    res.json(UpdateCampaignResponse.parse(campaign[0]));
  } catch (error) {
    console.error(`[Campaign] PATCH /campaigns/:id error:`, error instanceof Error ? error.message : String(error));
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to update campaign",
    });
  }
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const params = DeleteCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const campaign = await db.delete(campaignsTable).where(and(eq(campaignsTable.id, params.data.id), campaignOwnerFilter(req))).returning();
    if (!campaign || campaign.length === 0) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    console.log(`[Campaign] Deleted campaign ${params.data.id}`);
    res.sendStatus(204);
  } catch (error) {
    console.error(`[Campaign] DELETE /campaigns/:id error:`, error instanceof Error ? error.message : String(error));
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to delete campaign",
    });
  }
});

router.post("/campaigns/:id/launch", async (req, res): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const params = LaunchCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const campaign = await db.update(campaignsTable)
      .set({ status: "active", launchedAt: new Date() })
      .where(and(eq(campaignsTable.id, params.data.id), campaignOwnerFilter(req)))
      .returning();

    if (!campaign || campaign.length === 0) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    console.log(`[Campaign] Launched campaign ${params.data.id}`);

    // Kick off the autonomous agent in the background — same as on creation.
    // This is what actually drives the pipeline; without it the status flips
    // to active but no work is done and no SSE events are emitted.
    launchAgentForCampaign({
      campaignId:    params.data.id,
      owner:         { userId: req.user!.id, orgId: req.orgId ?? null },
      maxIterations: 10,
      enableLearning: true,
    }).catch((err) => {
      console.error(`[Campaign] Failed to start agent for campaign ${params.data.id}:`, err instanceof Error ? err.message : String(err));
    });

    res.json(LaunchCampaignResponse.parse(campaign[0]));
  } catch (error) {
    console.error(`[Campaign] POST /campaigns/:id/launch error:`, error instanceof Error ? error.message : String(error));
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to launch campaign",
    });
  }
});

router.post("/campaigns/:id/pause", async (req, res): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const params = PauseCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const campaign = await db.update(campaignsTable)
      .set({ status: "paused" })
      .where(and(eq(campaignsTable.id, params.data.id), campaignOwnerFilter(req)))
      .returning();

    if (!campaign || campaign.length === 0) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    console.log(`[Campaign] Paused campaign ${params.data.id}`);
    res.json(PauseCampaignResponse.parse(campaign[0]));
  } catch (error) {
    console.error(`[Campaign] POST /campaigns/:id/pause error:`, error instanceof Error ? error.message : String(error));
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to pause campaign",
    });
  }
});

// ── SSE: realtime pipeline progress ──────────────────────────────────────────
router.get("/campaigns/:id/pipeline-progress", async (req, res): Promise<void> => {
  if (!req.user?.id) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rawId = parseInt(req.params.id, 10);
  if (isNaN(rawId)) {
    res.status(400).json({ error: "Invalid campaign ID" });
    return;
  }

  // Ownership check — must belong to this user/org
  const campaigns = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, rawId), campaignOwnerFilter(req)))
    .limit(1)
    .catch(() => [] as { id: number }[]);

  if (!campaigns.length) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");   // disable nginx proxy buffering
  res.flushHeaders();

  const send = (event: PipelineStepEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Replay the last known step immediately on connect (handles page refresh / reconnect)
  const lastStep = pipelineEmitter.getLastStep(rawId);
  if (lastStep) send(lastStep);

  // Subscribe to future steps
  const listener = (event: PipelineStepEvent) => send(event);
  pipelineEmitter.on(`campaign:${rawId}`, listener);

  // Heartbeat every 15 s to prevent proxy / load-balancer timeouts
  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15_000);

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    pipelineEmitter.off(`campaign:${rawId}`, listener);
  });
});

export default router;
