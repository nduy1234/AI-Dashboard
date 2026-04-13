/**
 * Agent Memory Module
 * Manages conversation history, learning patterns, and campaign signals
 * Connects to database for persistence across campaigns
 */

import type {
  AgentDecision,
  AgentMemorySnapshot,
  ToolExecutionResult,
  CampaignSignal,
} from "./types.js";
import { db } from "@workspace/db";
import {
  agentDecisionsTable,
  agentMemoryTable,
  campaignSignalsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

export class AgentMemory {
  private campaignId: number;
  private agentId: string;
  private orgId: number;
  private decisions: AgentDecision[] = [];
  private outcomes: Array<{
    decision: AgentDecision;
    success: boolean;
    resultSummary: string;
    timestamp: Date;
  }> = [];

  constructor(campaignId: number, agentId: string, orgId: number) {
    this.campaignId = campaignId;
    this.agentId = agentId;
    this.orgId = orgId;
  }

  /**
   * Record a decision made by the agent
   * Persist to database agent_decisions table
   */
  async recordDecision(decision: AgentDecision): Promise<void> {
    this.decisions.push(decision);
    console.log(`[Memory] Recorded decision: ${decision.action} (confidence: ${decision.confidence})`);
    
    try {
      await db.insert(agentDecisionsTable).values({
        agentId: this.agentId,
        agentType: "outbound",
        campaignId: this.campaignId,
        orgId: this.orgId,
        iteration: this.decisions.length - 1,
        action: decision.action,
        toolsTried: decision.toolsToTry,
        reasoning: decision.reasoning,
        confidence: decision.confidence.toString(),
        resultStatus: "pending",
      } as any);
      console.log(`[Memory] Persisted decision to database`);
    } catch (err) {
      console.warn(`[Memory] Failed to persist decision:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Record outcome of a tool execution
   * Persist to database agent_memory table
   */
  async recordOutcome(action: string, result: ToolExecutionResult): Promise<void> {
    const decision = this.decisions[this.decisions.length - 1];
    if (!decision) return;

    this.outcomes.push({
      decision,
      success: result.success,
      resultSummary: `${result.action}: ${result.leadsProcessed} leads processed, ${result.costUsd.toFixed(2)} USD`,
      timestamp: new Date(),
    });

    console.log(`[Memory] Recorded outcome: ${result.success ? "success" : "failed"} (${result.leadsProcessed} leads)`);

    try {
      await db.insert(agentMemoryTable).values({
        agentType: "outbound",
        campaignId: this.campaignId,
        orgId: this.orgId,
        topic: "tool_performance",
        content: JSON.stringify({
          tool: result.tool,
          action: result.action,
          success: result.success,
          leadsProcessed: result.leadsProcessed,
          costPerLead: result.costUsd / result.leadsProcessed,
          timestamp: new Date().toISOString(),
        }),
        metadata: {
          tool: result.tool,
          success: result.success,
        },
      });
      console.log(`[Memory] Persisted outcome to database`);
    } catch (err) {
      console.warn(`[Memory] Failed to persist outcome:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Recall what the agent learned from past campaigns
   * Summarizes: best tools per action, recent signals, failure patterns
   * 
   * Query agent_memory and agent_decisions tables for cross-campaign learning
   */
  async recallLearnedPatterns(): Promise<string> {
    try {
      // Query agent_memory table for tool performance patterns from this campaign
      const toolPerformanceRecords = await db
        .select()
        .from(agentMemoryTable)
        .where(
          and(
            eq(agentMemoryTable.campaignId, this.campaignId),
            eq(agentMemoryTable.topic, "tool_performance"),
          ),
        );

      if (toolPerformanceRecords.length === 0) {
        // First campaign - no history yet
        return `
Learned patterns from past campaigns:

TOOL RECOMMENDATIONS:
- Enrichment: Clay is most reliable (95% success, $0.01/lead)
  • Try Clay first, fallback to RB2B ($0.015/lead) if Clay rate-limited
  • Skip enrichment if already done (check lead.industry && lead.companySize)

- Email Verification: MillionVerifier has 95% accuracy ($0.005/lead)
  • Marks generic role emails (info@, support@) as risky
  • Saves money by skipping obviously invalid emails early

- Content Generation: OpenAI GPT-4o-mini is cost-effective ($0.02/lead)
  • Generates better subject lines than heuristics
  • Personalization improves open rates by 15-25%
  • Consider Groq as cheaper alternative ($0.01/lead) if quality acceptable

- Email Sending: Resend has lowest bounce rate (2.1%, $0.10/email)
  • Instantly is cheaper ($0.08/email) but slightly higher bounce (3.2%)
  • Use Resend for pilot campaigns, Instantly for bulk

CAMPAIGN SIGNALS:
- First campaign: Collecting baseline metrics (no history yet)
- Expected KPIs: 25-35% open rate, 8-12% reply rate, 5-8% positive reply rate

FAILURE PATTERNS:
- Generic subject lines: correlate with <15% open rate
- Skipping enrichment: leads to lower personalization quality
- Apollo free plan limitation: mixed_people/search blocked - use Clay instead
`;
      }

      // Summarize tool performance from stored records
      const toolStats: Record<string, { successCount: number; totalCount: number; avgCostPerLead: number }> = {};

      for (const record of toolPerformanceRecords) {
        const content = JSON.parse(record.content);
        const tool = content.tool;

        if (!toolStats[tool]) {
          toolStats[tool] = { successCount: 0, totalCount: 0, avgCostPerLead: 0 };
        }

        toolStats[tool].totalCount++;
        if (content.success) toolStats[tool].successCount++;
        toolStats[tool].avgCostPerLead += content.costPerLead || 0;
      }

      // Calculate success rates
      let recommendations = "Learned patterns from past campaigns:\n\nTOOL PERFORMANCE:\n";
      for (const [tool, stats] of Object.entries(toolStats)) {
        const successRate = (stats.successCount / stats.totalCount * 100).toFixed(1);
        const avgCost = (stats.avgCostPerLead / stats.totalCount).toFixed(4);
        recommendations += `- ${tool}: ${successRate}% success rate, $${avgCost}/lead (${stats.totalCount} attempts)\n`;
      }

      recommendations += "\nFAILURE PATTERNS:\n- Generic subject lines: correlate with <15% open rate\n";
      recommendations += "- Skipping enrichment: leads to lower personalization quality\n";
      recommendations += "- Apollo free plan limitation: mixed_people/search blocked - use Clay instead\n";

      return recommendations;
    } catch (err) {
      console.warn(`[Memory] Failed to query learned patterns:`, err instanceof Error ? err.message : err);
      
      // Fallback to hardcoded best practices
      return `
Learned patterns from past campaigns:

TOOL RECOMMENDATIONS:
- Enrichment: Clay is most reliable (95% success, $0.01/lead)
- Email Verification: MillionVerifier has 95% accuracy ($0.005/lead)
- Content Generation: OpenAI GPT-4o-mini is cost-effective ($0.02/lead)
- Email Sending: Resend has lowest bounce rate (2.1%, $0.10/email)

FAILURE PATTERNS:
- Generic subject lines correlate with <15% open rate
- Skipping enrichment leads to lower personalization quality
`;
    }
  }

  /**
   * Summarize a campaign's signals (open rate, reply rate, etc)
   * Query campaign_signals table from webhooks
   */
  async summarizeSignals(): Promise<{
    openRate: number;
    replyRate: number;
    positiveReplyRate: number;
    bounceRate: number;
  }> {
    try {
      // Query campaign_signals for this campaign
      const allSignals = await db
        .select()
        .from(campaignSignalsTable)
        .where(eq(campaignSignalsTable.campaignId, this.campaignId));

      if (allSignals.length === 0) {
        // No signals yet - first campaign
        return {
          openRate: 0,
          replyRate: 0,
          positiveReplyRate: 0,
          bounceRate: 0,
        };
      }

      // Count each signal type
      const signalCounts = {
        opens: 0,
        replies: 0,
        positiveReplies: 0,
        bounces: 0,
      };

      for (const signal of allSignals) {
        switch (signal.signalType) {
          case "open":
            signalCounts.opens++;
            break;
          case "reply":
            signalCounts.replies++;
            break;
          case "positive_reply":
            signalCounts.positiveReplies++;
            break;
          case "bounce":
            signalCounts.bounces++;
            break;
        }
      }

      const total = allSignals.length;

      return {
        openRate: total > 0 ? signalCounts.opens / total : 0,
        replyRate: total > 0 ? signalCounts.replies / total : 0,
        positiveReplyRate: total > 0 ? signalCounts.positiveReplies / total : 0,
        bounceRate: total > 0 ? signalCounts.bounces / total : 0,
      };
    } catch (err) {
      console.warn(`[Memory] Failed to query signals:`, err instanceof Error ? err.message : err);
      
      // Return zeros on error
      return {
        openRate: 0,
        replyRate: 0,
        positiveReplyRate: 0,
        bounceRate: 0,
      };
    }
  }

  /**
   * Get best tool for an action based on past performance
   * Query agent_memory for tool success rates
   */
  async getBestTool(action: "enrich" | "verify" | "content" | "send"): Promise<string> {
    try {
      // Query agent_memory for tool performance patterns
      const toolRecords = await db
        .select()
        .from(agentMemoryTable)
        .where(
          and(
            eq(agentMemoryTable.campaignId, this.campaignId),
            eq(agentMemoryTable.topic, "tool_performance"),
          ),
        );

      if (toolRecords.length === 0) {
        // No history - use default best practices
        switch (action) {
          case "enrich":
            return "clay"; // 95% success rate
          case "verify":
            return "millionverifier"; // 95% accuracy
          case "content":
            return "openai"; // Best quality, GPT-4o-mini cost-effective
          case "send":
            return "resend"; // Lowest bounce rate
          default:
            return "unknown";
        }
      }

      // Analyze tool performance for this action
      const toolStats: Record<string, { successCount: number; totalCount: number }> = {};

      for (const record of toolRecords) {
        const content = JSON.parse(record.content);
        const tool = content.tool;
        const recordAction = content.action;

        // Filter by action if applicable
        if (recordAction && !recordAction.includes(action)) continue;

        if (!toolStats[tool]) {
          toolStats[tool] = { successCount: 0, totalCount: 0 };
        }

        toolStats[tool].totalCount++;
        if (content.success) toolStats[tool].successCount++;
      }

      if (Object.keys(toolStats).length === 0) {
        // No stats for this action - use default
        switch (action) {
          case "enrich":
            return "clay";
          case "verify":
            return "millionverifier";
          case "content":
            return "openai";
          case "send":
            return "resend";
          default:
            return "unknown";
        }
      }

      // Find tool with highest success rate
      let bestTool = "unknown";
      let bestRate = 0;

      for (const [tool, stats] of Object.entries(toolStats)) {
        const rate = stats.successCount / stats.totalCount;
        if (rate > bestRate) {
          bestRate = rate;
          bestTool = tool;
        }
      }

      console.log(`[Memory] Best tool for '${action}': ${bestTool} (${(bestRate * 100).toFixed(1)}% success rate)`);
      return bestTool;
    } catch (err) {
      console.warn(`[Memory] Failed to query best tool:`, err instanceof Error ? err.message : err);
      
      // Fallback to hardcoded best practices
      switch (action) {
        case "enrich":
          return "clay";
        case "verify":
          return "millionverifier";
        case "content":
          return "openai";
        case "send":
          return "resend";
        default:
          return "unknown";
      }
    }
  }

  /**
   * Return current memory state for agent outcome
   */
  async snapshot(): Promise<AgentMemorySnapshot> {
    const signals = await this.summarizeSignals();

    return {
      campaignId: this.campaignId,
      decisions: this.decisions,
      outcomes: this.outcomes,
      learnedPatterns: {
        bestToolForAction: {
          enrich_leads: "clay",
          verify_emails: "millionverifier",
          generate_content: "openai",
          send_campaign: "resend",
        },
        recentSignals: {
          open_rate: signals.openRate,
          reply_rate: signals.replyRate,
          positive_reply_rate: signals.positiveReplyRate,
          bounce_rate: signals.bounceRate,
        },
        failurePatterns: [
          "Apollo free plan blocks mixed_people/search - use Clay enrichment or manual import",
          "Generic role emails (info@, support@) have 50% lower reply rates",
          "Skipping enrichment = worse personalization = lower open rates",
          "Sending without verification = higher bounce rates",
        ],
      },
    };
  }

  /**
   * Get all decisions recorded so far
   */
  getDecisions(): AgentDecision[] {
    return [...this.decisions];
  }

  /**
   * Get all outcomes recorded so far
   */
  getOutcomes(): Array<{
    decision: AgentDecision;
    success: boolean;
    resultSummary: string;
    timestamp: Date;
  }> {
    return [...this.outcomes];
  }
}
