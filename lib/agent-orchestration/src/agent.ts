/**
 * LangChain-based Agent Loop
 * Autonomous decision-making for outbound pipeline
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { randomUUID } from "node:crypto";

import type {
  AgentConfig,
  AgentDecision,
  AgentOutcome,
  LeadBatch,
  ToolExecutionResult,
  CampaignSignal,
} from "./types.js";
import { AgentMemory } from "./memory.js";
import { executeAgentTool } from "./tools/index.js";

// MCP client imports - optional for trust gates and spend guards
let mcpClientInitialized = false;
let mcpClientReady = false;

async function initializeMcpClient() {
  if (mcpClientInitialized) return mcpClientReady;
  mcpClientInitialized = true;

  try {
    const mcp = await import("../../mcp-agent-orchestrator/dist/index.js" as any);
    if (mcp.initMcpClient) {
      await mcp.initMcpClient();
      mcpClientReady = true;
    }
    console.log(`\x1b[36m[MCP]\x1b[0m Client initialized successfully`);
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`\x1b[33m[MCP]\x1b[0m Failed to initialize: ${errMsg}. Running without spend guards.`);
    return false;
  }
}

async function callMcpTool(
  toolName: string,
  params: Record<string, any>,
  defaultValue: any = null,
) {
  if (!mcpClientReady) return defaultValue;

  try {
    const mcp = await import("../../mcp-agent-orchestrator/dist/index.js" as any);
    const toolFunction = (mcp as any)[toolName];
    if (!toolFunction) {
      console.warn(`\x1b[33m[MCP]\x1b[0m Tool ${toolName} not found`);
      return defaultValue;
    }
    return await toolFunction(...Object.values(params));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`\x1b[33m[MCP]\x1b[0m ${toolName} call failed: ${errMsg}`);
    return defaultValue;
  }
}

/**
 * Initialize MCP client once at application startup
 * Multiple agent runs will reuse the same connection
 * Call this in your main.ts or app.ts
 */
export async function initializeMcpOnStartup() {
  console.log(`\x1b[36m[Agent]\x1b[0m Initializing MCP client for agent framework`);
  const ready = await initializeMcpClient();
  if (ready) {
    // Fetch MCP tools to make them available to dispatcher
    try {
      const mcp = await import("../../mcp-agent-orchestrator/dist/index.js" as any);
      const tools = mcp.getMcpTools?.();
      if (tools && tools.length > 0) {
        console.log(`\x1b[32m[Agent]\x1b[0m MCP tools loaded: ${tools.map((t: any) => t.name).join(", ")}`);
      }
    } catch (err) {
      console.warn(`\x1b[33m[Agent]\x1b[0m Failed to fetch MCP tools:`, err instanceof Error ? err.message : String(err));
    }
    console.log(`\x1b[32m[Agent]\x1b[0m MCP is ready - trust gates and spend guards active`);
  } else {
    console.log(
      `\x1b[33m[Agent]\x1b[0m MCP not ready - agents will run without controls (development mode)`,
    );
  }
  return ready;
}

/**
 * Get MCP tools for dispatcher (after initialization)
 */
export async function getMcpToolsForDispatcher() {
  try {
    const mcp = await import("../../mcp-agent-orchestrator/dist/index.js" as any);
    return mcp.getMcpTools?.() || [];
  } catch (_err) {
    return [];
  }
}

/**
 * Check if MCP client is ready
 */
export function isMcpReady(): boolean {
  return mcpClientReady;
}

const parser = new JsonOutputParser<AgentDecision>();

/**
 * Main agent loop: iteratively decide → execute tools → learn
 */
export async function runOutboundAgent(
  config: AgentConfig,
  initialLeadBatch: LeadBatch,
): Promise<AgentOutcome> {
  const agentId = config.agentId || randomUUID();
  const memory = new AgentMemory(config.campaignId, agentId);
  const startTime = Date.now();

  // Initialize MCP client (async, optional - continues without it)
  await initializeMcpClient();

  const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: config.temperature,
  });

  let currentState = { ...initialLeadBatch };
  const decisions: AgentDecision[] = [];
  const toolResults: ToolExecutionResult[] = [];
  let totalCostUsd = 0;
  const errors: string[] = [];

  console.log(`\x1b[36m[agent ${agentId}]\x1b[0m Starting with ${currentState.leads.length} leads`);


  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    try {
      // 1. Recall patterns from past campaigns
      const memories = config.enableLearning
        ? await memory.recallLearnedPatterns()
        : "No prior campaign history.";

      // 2. Count current lead statuses
      const leadStats = {
        pending: currentState.leads.filter((l) => l.status === "pending").length,
        enriched: currentState.leads.filter((l) => l.status === "enriched").length,
        verified: currentState.leads.filter((l) => l.status === "verified").length,
        personalized: currentState.leads.filter((l) => l.status === "personalized").length,
        sent: currentState.leads.filter((l) => l.status === "sent").length,
        failed: currentState.leads.filter((l) => l.status === "failed").length,
      };

      // 3. Build decision prompt
      const decisionPrompt = PromptTemplate.fromTemplate(`
You are an autonomous AI agent managing an outbound B2B email campaign.

Your goal: Move leads through the pipeline (source → enrich → verify → personalize → send) while:
- Optimizing for quality (higher open/reply rates)
- Staying within budget constraints
- Learning from campaign signals

CURRENT STATE:
- Campaign ID: {campaignId}
- Iteration: {iteration}
- Lead breakdown: {leadStats}
- Total cost so far: ${totalCostUsd.toFixed(2)} USD

LEARNED PATTERNS FROM PAST CAMPAIGNS:
{memories}

AVAILABLE ACTIONS:
1. "source_leads" - Import leads from Apollo/Clay/manual
   Tools: ["apollo", "clay", "manual"]
   
2. "enrich_leads" - Add company intel (industry, size, LinkedIn)
   Tools: ["clay", "rb2b"]
   
3. "verify_emails" - Check email validity
   Tools: ["millionverifier"]
   
4. "generate_content" - Create personalized email copy
   Tools: ["openai", "groq"]
   
5. "send_campaign" - Send emails
   Tools: ["resend", "instantly", "smartlead"]
   
6. "review_signals" - Check if campaign is getting good open/reply rates
   Tools: ["mcp_ledger"] - Read signals from webhooks
   
7. "adjust_strategy" - If open rate <20%, try different approach (different subject, enricher, etc)
   
8. "pause" - Stop if constraints violated or manual request
   
9. "complete" - All leads sent or no viable path forward

RESPOND WITH JSON (no markdown):
{
  "action": "source_leads" | "enrich_leads" | "verify_emails" | "generate_content" | "send_campaign" | "review_signals" | "adjust_strategy" | "pause" | "complete",
  "toolsToTry": ["tool1", "tool2"],
  "reasoning": "Because ...",
  "confidence": 0.85,
  "expectedOutcome": "Move 50 leads to enriched state",
  "metrics": {
    "estimatedLeadsProcessed": 50,
    "estimatedCostUsd": 2.50
  }
}

Be decisive. If pending leads exist and no safety concern, move them forward. If all leads are sent, return "complete".
`);

      const formatted = await decisionPrompt.format({
        campaignId: config.campaignId,
        iteration: iteration + 1,
        leadStats: JSON.stringify(leadStats, null, 2),
        memories,
      });

      // 4. Call LLM to make decision
      const decision = await llm.invoke(formatted).then((msg) => {
        const cleanContent = String(msg.content)
          .replace(/```json\n?|\n?```/g, "")
          .trim();
        return parser.parse(cleanContent);
      });

      console.log(`\x1b[36m[agent ${agentId}:${iteration}]\x1b[0m Decision: ${decision.action} (confidence: ${decision.confidence})`);
      decisions.push(decision);

      // 5. Check trust gate via MCP (if available)
      let trustOk = true;
      if (mcpClientReady) {
        try {
          const trustResult = await callMcpTool(
            "validateAgentCapability",
            { agentId, action: decision.action },
            { allowed: true, reason: "MCP unavailable" }
          );
          trustOk = trustResult.allowed ?? true;
          if (!trustOk) {
            console.log(
              `\x1b[33m[agent ${agentId}:${iteration}]\x1b[0m Trust gate rejected: ${trustResult.reason}`,
            );
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`\x1b[33m[agent ${agentId}]\x1b[0m Trust check failed: ${errMsg}`);
          // Continue anyway - trust gate is optional
        }
      }

      // 6. Check budget guard via MCP (if available)
      let budgetOk = true;
      const estimatedCost = decision.metrics?.estimatedCostUsd || 0;
      if (mcpClientReady && estimatedCost > 0) {
        try {
          const budgetResult = await callMcpTool(
            "checkSpendBudget",
            {
              orgId: config.orgId,
              campaignId: config.campaignId,
              estimatedCostUsd: estimatedCost,
            },
            { allowed: true, reason: "MCP unavailable" }
          );
          budgetOk = budgetResult.allowed ?? true;
          if (!budgetOk) {
            console.log(
              `\x1b[33m[agent ${agentId}:${iteration}]\x1b[0m Budget guard rejected: ${budgetResult.reason}`,
            );
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`\x1b[33m[agent ${agentId}]\x1b[0m Budget check failed: ${errMsg}`);
          // Continue anyway - budget guard is optional
        }
      }

      if (!trustOk || !budgetOk) {
        errors.push(
          `Iteration ${iteration}: Decision rejected by guards (trust=${trustOk}, budget=${budgetOk})`,
        );
        console.log(`\x1b[31m[agent ${agentId}:${iteration}]\x1b[0m Decision rejected by control guards, pausing`);
        break;
      }

      // 7. Execute tools in priority order
      let toolSuccess = false;
      let result: ToolExecutionResult | null = null;

      for (const tool of decision.toolsToTry) {
        try {
          result = await executeAgentTool(
            decision.action,
            tool,
            currentState,
            config.orgId,
          );

          if (result.success) {
            toolSuccess = true;
            totalCostUsd += result.costUsd;
            toolResults.push(result);

            // Record spend to MCP ledger (if available)
            if (mcpClientReady && result.costUsd > 0) {
              try {
                const spendResult = await callMcpTool(
                  "recordSpend",
                  {
                    orgId: config.orgId,
                    campaignId: config.campaignId,
                    action: `${decision.action}_${tool}`,
                    amountUsd: result.costUsd,
                    agentId: agentId,
                  },
                  { recorded: true }
                );
                if (spendResult.recorded) {
                  console.log(
                    `\x1b[32m[agent ${agentId}:${iteration}]\x1b[0m Spend recorded: $${result.costUsd.toFixed(3)} for ${tool}`,
                  );
                }
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.warn(`\x1b[33m[agent ${agentId}]\x1b[0m recordSpend failed: ${errMsg}`);
              }
            }

            // Update lead state
            currentState.leads = currentState.leads.map((lead) => {
              if (
                result &&
                result.success &&
                decision.action === "enrich_leads" &&
                lead.status === "pending"
              ) {
                return { ...lead, status: "enriched" };
              }
              if (
                result &&
                result.success &&
                decision.action === "verify_emails" &&
                lead.status === "enriched"
              ) {
                return { ...lead, status: "verified" };
              }
              if (
                result &&
                result.success &&
                decision.action === "generate_content" &&
                lead.status === "verified"
              ) {
                return { ...lead, status: "personalized" };
              }
              if (
                result &&
                result.success &&
                decision.action === "send_campaign" &&
                lead.status === "personalized"
              ) {
                return { ...lead, status: "sent" };
              }
              return lead;
            });

            console.log(`\x1b[32m[agent ${agentId}:${iteration}]\x1b[0m Tool ${tool} succeeded: ${result.leadsProcessed} leads`);
            break; // Tool succeeded, move on
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.log(`\x1b[33m[agent ${agentId}:${iteration}]\x1b[0m Tool ${tool} failed: ${errMsg}, trying next...`);
        }
      }

      if (!toolSuccess) {
        const failMsg = `All tools failed for action ${decision.action}`;
        errors.push(failMsg);
        console.log(`\x1b[31m[agent ${agentId}:${iteration}]\x1b[0m ${failMsg}`);
      }

      // 7. Learn from outcome
      if (config.enableLearning) {
        await memory.recordDecision(decision);
        if (result) {
          await memory.recordOutcome(decision.action, result);
        }
      }

      // 8. Check exit conditions
      const allSent = currentState.leads.every((l) => l.status === "sent" || l.status === "failed");
      if (allSent || decision.action === "complete") {
        console.log(`\x1b[32m[agent ${agentId}]\x1b[0m All leads processed, exiting`);
        break;
      }

      if (decision.action === "pause") {
        console.log(`\x1b[33m[agent ${agentId}]\x1b[0m Paused by decision logic`);
        break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Iteration ${iteration}: ${msg}`);
      console.error(`\x1b[31m[agent ${agentId}:${iteration}]\x1b[0m Error: ${msg}`);
    }
  }

  const executionTimeMs = Date.now() - startTime;
  const successCount = currentState.leads.filter((l) => l.status === "sent").length;
  const failCount = currentState.leads.filter((l) => l.status === "failed").length;

  const outcome: AgentOutcome = {
    campaignId: config.campaignId,
    agentId,
    status: errors.length > 0 ? "failed" : successCount > 0 ? "completed" : "paused",
    totalIterations: decisions.length,
    leadsProcessed: currentState.leads.length,
    leadsSuccessful: successCount,
    leadsFailed: failCount,
    totalCostUsd,
    executionTimeMs,
    memory: await memory.snapshot(),
    decisions,
    errors: errors.length > 0 ? errors : undefined,
  };

  console.log(`\x1b[36m[agent ${agentId}]\x1b[0m Completed: ${successCount}/${currentState.leads.length} sent, cost: $${totalCostUsd.toFixed(2)}`);

  // Cleanup MCP client (keep-alive for next agent run)
  // Note: Don't close it yet to allow multiple agent runs without reinit
  // await closeMcpClient();

  return outcome;
}

/**
 * Cleanup MCP client when shutting down application
 */
export async function cleanupMcpClient() {
  try {
    const mcp = await import("../../mcp-agent-orchestrator/dist/index.js" as any);
    if (mcp.closeMcpClient) {
      await mcp.closeMcpClient();
    }
    mcpClientReady = false;
    mcpClientInitialized = false;
    console.log(`\x1b[36m[MCP]\x1b[0m Client closed`);
  } catch (err) {
    console.warn(`\x1b[33m[MCP]\x1b[0m Error closing client:`, err);
  }
}
