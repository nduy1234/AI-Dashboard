/**
 * Agent Routes
 * Autonomous agent orchestration endpoints.
 * All launch logic lives in agentLauncher.ts and is shared with campaigns.ts.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import type { OwnerContext } from "../security/ownerContext.js";
import { eq } from "drizzle-orm";
import { db, agentLogsTable, campaignsTable } from "@workspace/db";
import { activeRuns, launchAgentForCampaign } from "../agentLauncher.js";

const router: IRouter = Router();

/**
 * GET /api/v1/agents/health
 * Check agent system health (including MCP status)
 */
router.get("/agents/health", async (req: Request, res: Response): Promise<void> => {
  try {
    let mcpReady = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import("../../../lib/agent-orchestration/dist/index.js" as any);
      if (mod.isMcpReady) mcpReady = mod.isMcpReady();
    } catch {
      // Agent orchestration not available
    }

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      agent: {
        framework:           "LangChain",
        orchestration:       "MCP",
        mcpConnected:        mcpReady,
        controlPlaneActive:  mcpReady,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/v1/agents/start-outbound
 * Start an autonomous outbound campaign agent.
 * Delegates to launchAgentForCampaign() which is also called from POST /campaigns.
 */
router.post("/agents/start-outbound", async (req: Request, res: Response): Promise<void> => {
  try {
    const owner = (req as any).ownerContext as OwnerContext; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!owner) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { campaignId, maxIterations = 10, enableLearning = true } = req.body;

    if (!campaignId) {
      res.status(400).json({ error: "campaignId required" });
      return;
    }

    const parsedCampaignId = Number(campaignId);
    if (!Number.isInteger(parsedCampaignId) || parsedCampaignId <= 0) {
      res.status(400).json({ error: "campaignId must be a positive integer" });
      return;
    }

    const parsedMaxIterations = Number(maxIterations);
    if (!Number.isInteger(parsedMaxIterations) || parsedMaxIterations <= 0) {
      res.status(400).json({ error: "maxIterations must be a positive integer" });
      return;
    }

    const { agentId, leadsLoaded } = await launchAgentForCampaign({
      campaignId:    parsedCampaignId,
      owner,
      maxIterations: parsedMaxIterations,
      enableLearning: Boolean(enableLearning),
    });

    res.status(202).json({
      agentId,
      status:     "running",
      campaignId: parsedCampaignId,
      leadsLoaded,
    });
  } catch (error) {
    console.error("[API] Error starting agent:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to start agent",
    });
  }
});

/**
 * GET /api/v1/agents/:agentId/state
 * Get real-time agent run state.
 */
router.get("/agents/:agentId/state", async (req: Request, res: Response): Promise<void> => {
  try {
    const owner = (req as any).ownerContext as OwnerContext; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!owner) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const agentId = String(req.params.agentId);
    const active  = activeRuns.get(agentId);

    if (!active || active.orgId !== owner.orgId) {
      res.status(404).json({ error: "Agent run not found" });
      return;
    }

    res.json({
      agentId,
      status:      active.status,
      campaignId:  active.campaignId,
      startedAt:   active.startedAt,
      completedAt: active.completedAt,
      error:       active.error,
      outcome:     active.outcome,
      decisions:   [],
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch agent state",
    });
  }
});

/**
 * POST /api/v1/agents/:agentId/pause
 * Signal a running agent to stop after its current iteration.
 */
router.post("/agents/:agentId/pause", async (req: Request, res: Response): Promise<void> => {
  try {
    const owner = (req as any).ownerContext as OwnerContext; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!owner) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const agentId = String(req.params.agentId);
    const active  = activeRuns.get(agentId);

    if (!active || active.orgId !== owner.orgId) {
      res.status(404).json({ error: "Agent run not found" });
      return;
    }

    if (active.status !== "running") {
      res.status(409).json({
        agentId,
        status:  active.status,
        message: "Agent is not in running state",
      });
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import("../../../lib/agent-orchestration/dist/index.js" as any);
      if (mod.requestAgentPause) mod.requestAgentPause(agentId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Failed to request pause: ${errMsg}` });
      return;
    }

    activeRuns.set(agentId, { ...active, status: "pause_requested" });

    // Reflect pause on campaign row immediately
    await db
      .update(campaignsTable)
      .set({ status: "paused" })
      .where(eq(campaignsTable.id, active.campaignId))
      .catch(() => { /* non-fatal */ });

    await db.insert(agentLogsTable).values({
      agentType: "outbound",
      action:    "pause_requested",
      status:    "pause_requested",
      details:   `Pause requested for agent ${agentId}`,
      metadata:  { agentId, campaignId: active.campaignId },
      userId:    owner.userId,
      orgId:     owner.orgId,
    });

    res.json({ agentId, status: "pause_requested" });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to pause agent",
    });
  }
});

/**
 * GET /api/v1/agents/:agentId/decisions
 * Return the decision log for a completed or running agent run.
 */
router.get("/agents/:agentId/decisions", async (req: Request, res: Response): Promise<void> => {
  try {
    const owner = (req as any).ownerContext as OwnerContext; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!owner) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const agentId = String(req.params.agentId);

    res.json({ agentId, decisions: [], total: 0 });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch decisions",
    });
  }
});

export default router;
