/**
 * Agent Routes
 * New routes for autonomous agent orchestration
 */

import { Router, type IRouter, type Request, type Response } from "express";
import type { OwnerContext } from "../security/ownerContext.js";
import type { AgentConfig, AgentOutcome } from "@workspace/agent-orchestration";
import { db, agentLogs } from "@workspace/db";

const router: IRouter = Router();

/**
 * GET /api/v1/agents/health
 * Check agent system health (including MCP status)
 */
router.get("/agents/health", async (req: Request, res: Response): Promise<void> => {
  try {
    let mcpReady = false;
    try {
      const mod = await import("../../../lib/agent-orchestration/dist/index.js" as any);
      if (mod.isMcpReady) {
        mcpReady = mod.isMcpReady();
      }
    } catch (_err) {
      // Agent orchestration not available
    }
    
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      agent: {
        framework: "LangChain",
        orchestration: "MCP",
        mcpConnected: mcpReady,
        controlPlaneActive: mcpReady,
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
 * Start an autonomous outbound campaign agent
 */
router.post("/agents/start-outbound", async (req: Request, res: Response): Promise<void> => {
  try {
    const owner = (req as any).ownerContext as OwnerContext;
    if (!owner) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { campaignId, maxIterations = 5, enableLearning = true } = req.body;

    if (!campaignId) {
      res.status(400).json({ error: "campaignId required" });
      return;
    }

    // TODO: Verify campaign ownership

    const config: AgentConfig = {
      orgId: owner.orgId,
      userId: owner.userId,
      campaignId,
      maxIterations,
      temperature: 0.3, // Balanced between deterministic and creative
      enableLearning,
    };

    // Get initial lead batch
    // TODO: Query leads for campaign
    const initialLeads = {
      campaignId,
      leads: [],
    };

    console.log(`[API] Starting agent for campaign ${campaignId}`);

    // Run agent (this will run in background if needed)
    let outcome: AgentOutcome;
    try {
      const mod = await import("../../../lib/agent-orchestration/dist/index.js" as any);
      if (!mod.runOutboundAgent) {
        throw new Error("runOutboundAgent not available");
      }
      outcome = await mod.runOutboundAgent(config, initialLeads);
    } catch (err) {
      throw new Error(`Failed to run agent: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Log the agent run
    await db.insert(agentLogs).values({
      agentType: "outbound",
      action: "campaign_executed",
      status: outcome.status,
      details: `Campaign ${campaignId}: ${outcome.leadsSuccessful} successful, ${outcome.leadsFailed} failed`,
      metadata: {
        agentId: outcome.agentId,
        totalCost: outcome.totalCostUsd,
        iterations: outcome.totalIterations,
      },
      userId: owner.userId,
      orgId: owner.orgId,
    });

    res.json({
      agentId: outcome.agentId,
      status: outcome.status,
      campaignId,
      leadsProcessed: outcome.leadsProcessed,
      leadsSuccessful: outcome.leadsSuccessful,
      leadsFailed: outcome.leadsFailed,
      totalCostUsd: outcome.totalCostUsd,
      executionTimeMs: outcome.executionTimeMs,
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
 * Get real-time agent state and decision log
 */
router.get("/agents/:agentId/state", async (req: Request, res: Response): Promise<void> => {
  try {
    const owner = (req as any).ownerContext as OwnerContext;
    if (!owner) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { agentId } = req.params;

    // TODO: Query agent_decisions table for this agent
    // TODO: Return current decision log, memory state, budget consumed

    res.json({
      agentId,
      status: "running",
      decisions: [],
      memory: {},
      budgetConsumed: 0,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch agent state",
    });
  }
});

/**
 * POST /api/v1/agents/:agentId/pause
 * Pause a running agent
 */
router.post("/agents/:agentId/pause", async (req: Request, res: Response): Promise<void> => {
  try {
    const owner = (req as any).ownerContext as OwnerContext;
    if (!owner) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { agentId } = req.params;

    // TODO: Signal agent to pause (via Redis, message queue, or shared state)

    res.json({
      agentId,
      status: "paused",
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to pause agent",
    });
  }
});

/**
 * GET /api/v1/agents/:agentId/decisions
 * Stream decision log (can be WebSocket in future)
 */
router.get("/agents/:agentId/decisions", async (req: Request, res: Response): Promise<void> => {
  try {
    const owner = (req as any).ownerContext as OwnerContext;
    if (!owner) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { agentId } = req.params;

    // TODO: Query agent_decisions table
    // TODO: Return paginated decisions with timestamps

    res.json({
      agentId,
      decisions: [],
      total: 0,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch decisions",
    });
  }
});

export default router;
