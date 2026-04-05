/**
 * Agent Repository Layer
 * Persists agent state, decisions, and memory to database
 * Used for replay, debugging, and cross-campaign learning
 */

import { db } from "@workspace/db";
import {
  agentDecisionsTable,
  agentMemoryTable,
  campaignSignalsTable,
} from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import type { AgentDecision, ToolExecutionResult } from "./types.js";

/**
 * Persist a decision to agent_decisions table
 * Called after each decision in the agent loop
 */
export async function persistAgentDecision(
  agentId: string,
  campaignId: number,
  orgId: number,
  iteration: number,
  decision: AgentDecision,
): Promise<void> {
  try {
    await db.insert(agentDecisionsTable).values({
      agentId,
      agentType: "outbound",
      campaignId,
      orgId,
      iteration,
      action: decision.action,
      toolsTried: decision.toolsToTry,
      reasoning: decision.reasoning,
      confidence: decision.confidence.toString(),
      resultStatus: "pending",
      resultData: {
        expectedOutcome: decision.expectedOutcome,
        metrics: decision.metrics,
      },
    } as any);
    console.log(`[Repository] Persisted decision ${iteration} for campaign ${campaignId}`);
  } catch (error) {
    console.error("[Repository] Failed to persist decision:", error);
  }
}

/**
 * Update decision with result status
 * Called after tool execution completes
 */
export async function updateAgentDecisionResult(
  agentId: string,
  campaignId: number,
  iteration: number,
  result: ToolExecutionResult,
): Promise<void> {
  try {
    await db
      .update(agentDecisionsTable)
      .set({
        resultStatus: result.success ? "success" : "failed",
        resultData: {
          leadsProcessed: result.leadsProcessed,
          leadsFailed: result.leadsFailed,
          costUsd: result.costUsd,
          error: result.error,
        },
      })
      .where(
        and(
          eq(agentDecisionsTable.agentId, agentId),
          eq(agentDecisionsTable.campaignId, campaignId),
          eq(agentDecisionsTable.iteration, iteration),
        ),
      );
    console.log(`[Repository] Updated decision result for iteration ${iteration}`);
  } catch (error) {
    console.error("[Repository] Failed to update decision:", error);
  }
}

/**
 * Persist learned pattern to agent_memory table
 * Called during memory recording
 */
export async function persistAgentMemoryPattern(
  campaignId: number,
  orgId: number,
  topic: "lead_quality" | "tool_performance" | "strategy",
  content: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(agentMemoryTable).values({
      agentType: "outbound",
      campaignId,
      orgId,
      topic,
      content: JSON.stringify(content),
      metadata: {
        topic,
        timestamp: new Date().toISOString(),
      },
    });
    console.log(`[Repository] Persisted memory pattern: ${topic}`);
  } catch (error) {
    console.error("[Repository] Failed to persist memory pattern:", error);
  }
}

/**
 * Record campaign signal (webhook event)
 * Called when signal handlers convert webhooks to database records
 */
export async function recordCampaignSignal(
  campaignId: number,
  leadId: number | undefined,
  signalType: "open" | "click" | "reply" | "positive_reply" | "bounce" | "unsubscribe",
  externalId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(campaignSignalsTable).values({
      campaignId,
      leadId,
      signalType,
      externalId,
      metadata,
      value: 1,
    });
    console.log(`[Repository] Recorded signal: ${signalType} for campaign ${campaignId}`);
  } catch (error) {
    console.error("[Repository] Failed to record signal:", error);
  }
}

/**
 * Query campaign signals to compute KPIs
 * Used by agent to review campaign performance
 */
export async function getCampaignSignalsKpis(
  campaignId: number,
): Promise<{
  openRate: number;
  replyRate: number;
  positiveReplyRate: number;
  bounceRate: number;
  totalSignals: number;
}> {
  try {
    const signals = await db
      .select()
      .from(campaignSignalsTable)
      .where(eq(campaignSignalsTable.campaignId, campaignId));

    if (signals.length === 0) {
      return {
        openRate: 0,
        replyRate: 0,
        positiveReplyRate: 0,
        bounceRate: 0,
        totalSignals: 0,
      };
    }

    let opens = 0,
      replies = 0,
      positiveReplies = 0,
      bounces = 0;

    for (const signal of signals) {
      switch (signal.signalType) {
        case "open":
          opens++;
          break;
        case "reply":
          replies++;
          break;
        case "positive_reply":
          positiveReplies++;
          break;
        case "bounce":
          bounces++;
          break;
      }
    }

    const total = signals.length;

    return {
      openRate: opens / total,
      replyRate: replies / total,
      positiveReplyRate: positiveReplies / total,
      bounceRate: bounces / total,
      totalSignals: total,
    };
  } catch (error) {
    console.error("[Repository] Failed to get campaign signals KPIs:", error);
    return {
      openRate: 0,
      replyRate: 0,
      positiveReplyRate: 0,
      bounceRate: 0,
      totalSignals: 0,
    };
  }
}

/**
 * Query agent decisions for a campaign
 * Used for replaying decision history or debugging
 */
export async function getAgentDecisions(
  agentId: string,
  campaignId: number,
): Promise<AgentDecision[]> {
  try {
    const decisions = await db
      .select()
      .from(agentDecisionsTable)
      .where(
        and(
          eq(agentDecisionsTable.agentId, agentId),
          eq(agentDecisionsTable.campaignId, campaignId),
        ),
      )
      .orderBy(agentDecisionsTable.iteration);

    console.log(
      `[Repository] Retrieved ${decisions.length} decisions for agent ${agentId} campaign ${campaignId}`,
    );
    return decisions as unknown as AgentDecision[];
  } catch (error) {
    console.error("[Repository] Failed to get agent decisions:", error);
    return [];
  }
}

/**
 * Get tool performance metrics
 * Used by agent to decide which tool to try first
 */
export async function getToolPerformance(
  tool: string,
  timeWindow: "last_7d" | "last_30d" | "all_time" = "last_30d",
): Promise<{
  successRate: number;
  avgLatencyMs: number;
  avgCostPerUse: number;
  totalUses: number;
}> {
  try {
    // Query agent_decisions for decisions that included this tool
    const decisions = await db
      .select()
      .from(agentDecisionsTable)
      .where(
        sql`${agentDecisionsTable.toolsTried}::text ILIKE ${'%' + tool + '%'}`,
      );

    if (decisions.length === 0) {
      // No history - use intelligent defaults based on known tool characteristics
      const defaults: Record<string, any> = {
        clay: { successRate: 0.95, avgLatencyMs: 250, avgCostPerUse: 0.01, totalUses: 0 },
        rb2b: { successRate: 0.90, avgLatencyMs: 300, avgCostPerUse: 0.015, totalUses: 0 },
        millionverifier: {
          successRate: 0.95,
          avgLatencyMs: 200,
          avgCostPerUse: 0.005,
          totalUses: 0,
        },
        openai: { successRate: 0.98, avgLatencyMs: 1000, avgCostPerUse: 0.02, totalUses: 0 },
        resend: { successRate: 0.99, avgLatencyMs: 500, avgCostPerUse: 0.1, totalUses: 0 },
        instantly: { successRate: 0.98, avgLatencyMs: 600, avgCostPerUse: 0.08, totalUses: 0 },
      };
      return defaults[tool] || { successRate: 0.5, avgLatencyMs: 500, avgCostPerUse: 0.01, totalUses: 0 };
    }

    // Analyze decision results
    let successCount = 0;
    let totalLatency = 0;
    let totalCost = 0;

    for (const decision of decisions) {
      if (decision.resultStatus === "success") successCount++;

      if (decision.resultData && typeof decision.resultData === "object") {
        const data = decision.resultData as Record<string, any>;
        if (data.latency) totalLatency += data.latency;
        if (data.cost) totalCost += data.cost;
      }
    }

    const successRate = successCount / decisions.length;
    const avgLatencyMs = decisions.length > 0 ? totalLatency / decisions.length : 500;
    const avgCostPerUse = decisions.length > 0 ? totalCost / decisions.length : 0.01;

    console.log(
      `[Repository] Tool '${tool}' performance: ${(successRate * 100).toFixed(1)}% success, ` +
        `${avgLatencyMs.toFixed(0)}ms latency, $${avgCostPerUse.toFixed(4)}/use (${decisions.length} uses)`,
    );

    return {
      successRate,
      avgLatencyMs,
      avgCostPerUse,
      totalUses: decisions.length,
    };
  } catch (error) {
    console.error("[Repository] Failed to get tool performance:", error);

    // Fallback to defaults
    const defaults: Record<string, any> = {
      clay: { successRate: 0.95, avgLatencyMs: 250, avgCostPerUse: 0.01, totalUses: 0 },
      rb2b: { successRate: 0.90, avgLatencyMs: 300, avgCostPerUse: 0.015, totalUses: 0 },
      millionverifier: {
        successRate: 0.95,
        avgLatencyMs: 200,
        avgCostPerUse: 0.005,
        totalUses: 0,
      },
      openai: { successRate: 0.98, avgLatencyMs: 1000, avgCostPerUse: 0.02, totalUses: 0 },
      resend: { successRate: 0.99, avgLatencyMs: 500, avgCostPerUse: 0.1, totalUses: 0 },
      instantly: { successRate: 0.98, avgLatencyMs: 600, avgCostPerUse: 0.08, totalUses: 0 },
    };
    return defaults[tool] || { successRate: 0.5, avgLatencyMs: 500, avgCostPerUse: 0.01, totalUses: 0 };
  }
}
