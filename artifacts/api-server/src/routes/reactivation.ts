/**
 * Reactivation Engine Routes
 *
 * POST /reactivation/scan                  — trigger HubSpot background scan job
 * GET  /reactivation/scan/:jobId/progress  — SSE stream of scan progress
 * POST /reactivation/campaigns             — create reactivation campaign + sequence steps
 * POST /reactivation/campaigns/:id/launch  — schedule all step-1 emails
 * GET  /reactivation/campaigns/:id/status  — sequence execution status for a campaign
 * POST /reactivation/settings              — update daily outreach limit & safety settings
 * GET  /reactivation/settings              — read current safety settings
 */

import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  leadsTable,
  campaignsTable,
  campaignLeadsTable,
  campaignSequenceStepsTable,
  reactivationScanJobsTable,
  integrationsTable,
  agentLogsTable,
} from "@workspace/db";
import { getOwnerContext, ownerScope } from "../security/ownerContext";
import {
  scanEmitter,
  enqueueScanJob,
  enqueueSequenceStep,
  getDailyOutreachCount,
} from "../services/reactivationService";

const router: IRouter = Router();

// ── POST /reactivation/scan ──────────────────────────────────────────────────

router.post("/reactivation/scan", async (req, res): Promise<void> => {
  const owner = getOwnerContext(req);

  // Ensure HubSpot is connected
  const [integration] = await db
    .select()
    .from(integrationsTable)
    .where(and(eq(integrationsTable.type, "hubspot"), ownerScope(integrationsTable, owner)));

  if (!integration || !integration.apiKeyConfigured) {
    res.status(400).json({ error: "HubSpot is not connected. Connect it first via the CRM Import tab." });
    return;
  }

  const {
    inactivityDays = 30,
    dealStage,
    minDealValue = 0,
  } = req.body as {
    inactivityDays?: number;
    dealStage?: string;
    minDealValue?: number;
  };

  // Create scan job record
  const [scanJob] = await db
    .insert(reactivationScanJobsTable)
    .values({
      status: "queued",
      filters: { inactivityDays, dealStage, minDealValue },
      userId: owner.userId,
      orgId: owner.orgId,
    })
    .returning();

  if (!scanJob) {
    res.status(500).json({ error: "Failed to create scan job" });
    return;
  }

  // Enqueue background job
  await enqueueScanJob(scanJob.id);

  res.json({ ok: true, jobId: scanJob.id, status: "queued" });
});

// ── GET /reactivation/scan/:jobId/progress (SSE) ─────────────────────────────

router.get("/reactivation/scan/:jobId/progress", async (req, res): Promise<void> => {
  const jobId = parseInt(req.params.jobId, 10);
  if (isNaN(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === "function") (res as any).flush();
  };

  // Replay last known state immediately
  const last = scanEmitter.getLastEvent(jobId);
  if (last) {
    sendEvent(last);
    if (last.status === "completed" || last.status === "failed") {
      res.end();
      return;
    }
  } else {
    // Query DB for current state
    const [job] = await db
      .select()
      .from(reactivationScanJobsTable)
      .where(eq(reactivationScanJobsTable.id, jobId));

    if (job) {
      const progress = job.status === "completed" ? 100 : job.status === "running" ? 50 : 5;
      sendEvent({
        jobId,
        status: job.status,
        totalFound: job.totalFound,
        imported: job.imported,
        duplicates: job.duplicates,
        excluded: job.excluded,
        progress,
        error: job.error ?? undefined,
      });

      if (job.status === "completed" || job.status === "failed") {
        res.end();
        return;
      }
    }
  }

  // Subscribe to live events
  const onProgress = (data: object) => {
    sendEvent(data);
    const d = data as { status: string };
    if (d.status === "completed" || d.status === "failed") {
      cleanup();
      res.end();
    }
  };

  const cleanup = () => {
    scanEmitter.off(`scan:${jobId}`, onProgress);
  };

  scanEmitter.on(`scan:${jobId}`, onProgress);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
    if (typeof (res as any).flush === "function") (res as any).flush();
  }, 20000);

  req.on("close", () => {
    cleanup();
    clearInterval(heartbeat);
  });
});

// ── POST /reactivation/campaigns ─────────────────────────────────────────────

router.post("/reactivation/campaigns", async (req, res): Promise<void> => {
  const owner = getOwnerContext(req);
  const {
    name,
    leadIds,
    steps,
    channel = "email",
  } = req.body as {
    name: string;
    leadIds: number[];
    steps: Array<{ stepNumber: number; delayDays: number; subject: string; body: string }>;
    channel?: string;
  };

  if (!name || !Array.isArray(leadIds) || leadIds.length === 0 || !Array.isArray(steps) || steps.length === 0) {
    res.status(400).json({ error: "name, leadIds, and steps are required" });
    return;
  }

  // Create campaign
  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      name,
      type: "reactivation",
      status: "draft",
      subject: steps[0]?.subject,
      emailSequenceCount: steps.length,
      leadCount: leadIds.length,
      userId: owner.userId,
      orgId: owner.orgId,
    })
    .returning();

  if (!campaign) {
    res.status(500).json({ error: "Failed to create campaign" });
    return;
  }

  // Create campaign_leads entries
  const campaignLeadValues = leadIds.map((leadId) => ({
    campaignId: campaign.id,
    leadId,
    status: "pending",
  }));
  await db.insert(campaignLeadsTable).values(campaignLeadValues);

  // Create sequence steps for each lead × each step
  const sequenceValues: typeof campaignSequenceStepsTable.$inferInsert[] = [];
  for (const leadId of leadIds) {
    for (const step of steps) {
      sequenceValues.push({
        campaignId: campaign.id,
        leadId,
        stepNumber: step.stepNumber,
        delayDays: step.delayDays,
        subject: step.subject,
        body: step.body,
        status: "pending",
      });
    }
  }
  await db.insert(campaignSequenceStepsTable).values(sequenceValues);

  res.json({ ok: true, campaignId: campaign.id, leadsCount: leadIds.length, stepsCount: steps.length });
});

// ── POST /reactivation/campaigns/:id/launch ──────────────────────────────────

router.post("/reactivation/campaigns/:id/launch", async (req, res): Promise<void> => {
  const owner = getOwnerContext(req);
  const campaignId = parseInt(req.params.id, 10);
  if (isNaN(campaignId)) {
    res.status(400).json({ error: "Invalid campaign ID" });
    return;
  }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, campaignId), ownerScope(campaignsTable, owner)));

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  if (campaign.status === "active") {
    res.status(400).json({ error: "Campaign is already active" });
    return;
  }

  // Get all step-1 sequence steps for this campaign
  const firstSteps = await db
    .select()
    .from(campaignSequenceStepsTable)
    .where(
      and(
        eq(campaignSequenceStepsTable.campaignId, campaignId),
        eq(campaignSequenceStepsTable.stepNumber, 1),
        eq(campaignSequenceStepsTable.status, "pending"),
      ),
    );

  // Enqueue step 1 for all leads immediately
  let queued = 0;
  for (const step of firstSteps) {
    await enqueueSequenceStep(step.id, 0);
    queued++;
  }

  // Activate campaign
  await db
    .update(campaignsTable)
    .set({ status: "active", launchedAt: new Date() })
    .where(eq(campaignsTable.id, campaignId));

  await db.insert(agentLogsTable).values({
    agentType: "reactivation",
    action: "launch_campaign",
    status: "completed",
    details: `Launched reactivation campaign "${campaign.name}" — queued ${queued} step-1 emails`,
    userId: owner.userId,
    orgId: owner.orgId,
  });

  res.json({ ok: true, campaignId, queuedEmails: queued });
});

// ── GET /reactivation/campaigns/:id/status ───────────────────────────────────

router.get("/reactivation/campaigns/:id/status", async (req, res): Promise<void> => {
  const owner = getOwnerContext(req);
  const campaignId = parseInt(req.params.id, 10);
  if (isNaN(campaignId)) {
    res.status(400).json({ error: "Invalid campaign ID" });
    return;
  }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, campaignId), ownerScope(campaignsTable, owner)));

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const allSteps = await db
    .select()
    .from(campaignSequenceStepsTable)
    .where(eq(campaignSequenceStepsTable.campaignId, campaignId));

  const stepCounts = allSteps.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const dailyCount = await getDailyOutreachCount(owner.orgId);

  // Rate limit warnings
  const rateLimitLogs = await db
    .select()
    .from(agentLogsTable)
    .where(
      and(
        eq(agentLogsTable.agentType, "reactivation"),
        eq(agentLogsTable.action, "rate_limited"),
        ownerScope(agentLogsTable, owner),
      ),
    )
    .orderBy(desc(agentLogsTable.timestamp))
    .limit(5);

  res.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      leadCount: campaign.leadCount,
      sentCount: campaign.sentCount,
      replyCount: campaign.replyCount,
      meetingsBooked: campaign.meetingsBooked,
    },
    sequenceSteps: stepCounts,
    totalSteps: allSteps.length,
    dailyOutreachToday: dailyCount,
    rateLimitWarnings: rateLimitLogs.map((l) => ({ id: l.id, details: l.details, timestamp: l.timestamp })),
  });
});

// ── POST /reactivation/settings ──────────────────────────────────────────────

router.post("/reactivation/settings", async (req, res): Promise<void> => {
  const owner = getOwnerContext(req);
  const { dailyOutreachLimit, safetyMode } = req.body as {
    dailyOutreachLimit?: number;
    safetyMode?: boolean;
  };

  if (dailyOutreachLimit !== undefined && (typeof dailyOutreachLimit !== "number" || dailyOutreachLimit < 1 || dailyOutreachLimit > 10000)) {
    res.status(400).json({ error: "dailyOutreachLimit must be between 1 and 10,000" });
    return;
  }

  const [integration] = await db
    .select()
    .from(integrationsTable)
    .where(and(eq(integrationsTable.type, "hubspot"), ownerScope(integrationsTable, owner)));

  const existingConfig = (integration?.config as Record<string, unknown>) ?? {};

  await db
    .update(integrationsTable)
    .set({
      config: {
        ...existingConfig,
        ...(dailyOutreachLimit !== undefined ? { dailyOutreachLimit } : {}),
        ...(safetyMode !== undefined ? { safetyMode } : {}),
      },
    })
    .where(and(eq(integrationsTable.type, "hubspot"), ownerScope(integrationsTable, owner)));

  res.json({ ok: true, dailyOutreachLimit, safetyMode });
});

// ── GET /reactivation/settings ───────────────────────────────────────────────

router.get("/reactivation/settings", async (req, res): Promise<void> => {
  const owner = getOwnerContext(req);

  const [integration] = await db
    .select()
    .from(integrationsTable)
    .where(and(eq(integrationsTable.type, "hubspot"), ownerScope(integrationsTable, owner)));

  const config = (integration?.config as Record<string, unknown>) ?? {};

  res.json({
    dailyOutreachLimit: Number(config.dailyOutreachLimit) || 100,
    safetyMode: Boolean(config.safetyMode ?? true),
    dailyOutreachToday: await getDailyOutreachCount(owner.orgId),
    hubspotStatus: integration?.status ?? "disconnected",
    hubspotPortalId: config.portalId ?? null,
  });
});

export default router;
