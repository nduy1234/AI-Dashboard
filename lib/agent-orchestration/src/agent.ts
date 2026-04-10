/**
 * LangChain-based Agent Loop — StateGraph edition
 * Autonomous decision-making for outbound pipeline
 *
 * Architecture:
 *   runOutboundAgent() compiles a LangGraph StateGraph with four nodes:
 *     decide → guard → execute → postExec → (loop back to decide)
 *   An LCEL chain (PromptTemplate | ChatOpenAI | JsonOutputParser) drives decisions.
 *   MCP client provides optional trust gates and spend guards.
 */

import { ChatGroq } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";

import type {
  AgentConfig,
  AgentDecision,
  AgentOutcome,
  LeadBatch,
  ToolExecutionResult,
} from "./types.js";
import { AgentMemory } from "./memory.js";
import { executeAgentTool } from "./tools/index.js";
import { db, campaignsTable, campaignLeadsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// ─── MCP client singleton ─────────────────────────────────────────────────────

let mcpClientInitialized = false;
let mcpClientReady = false;
const pauseRequestedAgents = new Set<string>();

async function initializeMcpClient(): Promise<boolean> {
  if (mcpClientInitialized) return mcpClientReady;
  mcpClientInitialized = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mcp = await import("../../mcp-agent-orchestrator/dist/index.js" as any);
    if (mcp.initMcpClient) {
      await mcp.initMcpClient();
      mcpClientReady = true;
    }
    console.log(`\x1b[36m[MCP]\x1b[0m Client initialized successfully`);
    return true;
  } catch (err) {
    console.warn(
      `\x1b[33m[MCP]\x1b[0m Failed to initialize: ${err instanceof Error ? err.message : String(err)}. Running without spend guards.`,
    );
    return false;
  }
}

async function callMcpTool(
  toolName: string,
  params: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultValue: any = null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (!mcpClientReady) return defaultValue;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mcp = await import("../../mcp-agent-orchestrator/dist/index.js" as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (mcp as Record<string, any>)[toolName];
    if (!fn) {
      console.warn(`\x1b[33m[MCP]\x1b[0m Tool ${toolName} not found`);
      return defaultValue;
    }
    return await fn(...Object.values(params));
  } catch (err) {
    console.warn(
      `\x1b[33m[MCP]\x1b[0m ${toolName} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return defaultValue;
  }
}

/**
 * Initialize MCP client once at application startup.
 * Multiple agent runs reuse the same connection.
 * Call this from your main.ts / app.ts.
 */
export async function initializeMcpOnStartup(): Promise<boolean> {
  console.log(`\x1b[36m[Agent]\x1b[0m Initializing MCP client for agent framework`);
  const ready = await initializeMcpClient();
  if (ready) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mcp = await import("../../mcp-agent-orchestrator/dist/index.js" as any);
      const tools = (mcp as { getMcpTools?: () => { name: string }[] }).getMcpTools?.();
      if (tools?.length) {
        console.log(`\x1b[32m[Agent]\x1b[0m MCP tools loaded: ${tools.map((t) => t.name).join(", ")}`);
      }
    } catch {
      // non-fatal
    }
    console.log(`\x1b[32m[Agent]\x1b[0m MCP is ready — trust gates and spend guards active`);
  } else {
    console.log(`\x1b[33m[Agent]\x1b[0m MCP not ready — agents will run without controls (development mode)`);
  }
  return ready;
}

/** Return the list of MCP tools (after initialization). */
export async function getMcpToolsForDispatcher(): Promise<unknown[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mcp = await import("../../mcp-agent-orchestrator/dist/index.js" as any);
    return (mcp as { getMcpTools?: () => unknown[] }).getMcpTools?.() ?? [];
  } catch {
    return [];
  }
}

/** Whether the MCP client is connected and ready. */
export function isMcpReady(): boolean {
  return mcpClientReady;
}

/** Signal a running agent to stop after the current iteration. */
export function requestAgentPause(agentId: string): void {
  pauseRequestedAgents.add(agentId);
}

/** Clear a previously requested pause for an agent. */
export function clearAgentPause(agentId: string): void {
  pauseRequestedAgents.delete(agentId);
}

/** Returns true if a pause has been requested for the given agent. */
export function isAgentPauseRequested(agentId: string): boolean {
  return pauseRequestedAgents.has(agentId);
}

// ─── LCEL chain — module-level, built once ────────────────────────────────────
//
// Only the LLM is created per-run (to respect config.temperature).
// The PromptTemplate and parser are immutable and safe to share.

const decisionPromptTemplate = PromptTemplate.fromTemplate(
  `You are an autonomous AI agent managing an outbound B2B email campaign.
  
Your goal: Move leads through the pipeline sequentially (source → enrich → verify → personalize → send).

CAMPAIGN CONTEXT:
- Name: {campaignName}
- Type: {campaignType}
- Subject: {campaignSubject}

CURRENT STATE:
- Campaign ID: {campaignId}
- Iteration: {iteration}
- Lead breakdown: {leadStats}
- Total cost so far: {totalCostUsd} USD

LEARNED PATTERNS (PAST PERFORMANCE):
{memories}

TRANSITION RULES (MANDATORY):
1. If no leads exist (total=0) OR 'source_leads' failed recently, choose 'source_leads'.
2. If 'pending' > 0, choose 'enrich_leads'.
3. If 'enriched' > 0 AND 'pending' == 0, choose 'verify_emails' (DO NOT loop on enrich).
4. If 'verified' > 0 AND 'enriched' == 0, choose 'generate_content'.
5. If 'personalized' > 0 AND 'verified' == 0, choose 'send_campaign'.
6. If all leads are 'sent' or 'failed', choose 'complete'.

IMPORTANT:
- Prioritize the Lead Breakdown numbers over Learned Patterns.
- If a tool failed with "no contacts found" or similar, do not retry the same tool immediately; try a different tool or action.
- The "reasoning" field MUST be ≤ 120 characters. No exceptions. Truncate if needed.

RESPOND WITH JSON ONLY (no markdown, no explanation outside the JSON):
{{"action":"...","toolsToTry":["..."],"reasoning":"<= 120 chars","confidence":0.9}}`,
);

const decisionParser = new JsonOutputParser<AgentDecision>();

// ─── LangGraph state annotation ───────────────────────────────────────────────

type LeadItem = LeadBatch["leads"][number];

const AgentStateAnnotation = Annotation.Root({
  leads:        Annotation<LeadItem[]>(),
  config:       Annotation<AgentConfig>(),
  agentId:      Annotation<string>(),
  memories:     Annotation<string>(),
  decisions:    Annotation<AgentDecision[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  totalCostUsd: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
  errors: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  iteration:    Annotation<number>(),
  lastDecision: Annotation<AgentDecision | null>(),
  lastResult:   Annotation<ToolExecutionResult | null>(),
  paused:       Annotation<boolean>(),
  /** Monotonic sum of node visits — circuit breaker vs logical loops. */
  graphHopCount: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
  /** Fingerprint of last non-progress execution (empty/error noop). */
  lastStagnationSignature: Annotation<string | null>(),
  /** How many consecutive times the same stagnation signature occurred. */
  stagnationRepeatCount: Annotation<number>(),
});

type AgentState = typeof AgentStateAnnotation.State;

// ─── State helpers ────────────────────────────────────────────────────────────

function buildLeadStats(leads: LeadItem[]) {
  return {
    pending:      leads.filter((l) => l.status === "pending").length,
    enriched:     leads.filter((l) => l.status === "enriched").length,
    verified:     leads.filter((l) => l.status === "verified").length,
    personalized: leads.filter((l) => l.status === "personalized").length,
    sent:         leads.filter((l) => l.status === "sent").length,
    failed:       leads.filter((l) => l.status === "failed").length,
  };
}

function applyLeadTransition(leads: LeadItem[], action: string): LeadItem[] {
  const transitions: Record<string, { from: LeadItem["status"]; to: LeadItem["status"] }> = {
    enrich_leads:     { from: "pending",      to: "enriched"    },
    verify_emails:    { from: "enriched",     to: "verified"    },
    generate_content: { from: "verified",     to: "personalized"},
    send_campaign:    { from: "personalized", to: "sent"        },
  };
  const t = transitions[action];
  if (!t) return leads;
  return leads.map((l) => (l.status === t.from ? { ...l, status: t.to } : l));
}

/**
 * Returns a fully-determined AgentDecision when the pipeline state leaves no
 * ambiguity, bypassing the LLM entirely.  Returns null when the LLM is still
 * needed (e.g. mixed states not covered by the simple rules).
 */
function forcedTransition(
  stats: ReturnType<typeof buildLeadStats>,
): AgentDecision | null {
  const total = stats.pending + stats.enriched + stats.verified +
    stats.personalized + stats.sent + stats.failed;

  if (total === 0) {
    return {
      action: "source_leads",
      toolsToTry: ["apollo", "google"],
      reasoning: "No leads — must source first.",
      confidence: 1.0,
    };
  }

  const allTerminal = stats.sent + stats.failed === total;
  if (allTerminal) {
    return {
      action: "complete",
      toolsToTry: [],
      reasoning: "All leads reached terminal status.",
      confidence: 1.0,
    };
  }

  if (stats.pending > 0) {
    return {
      action: "enrich_leads",
      toolsToTry: ["clay", "rb2b"],
      reasoning: `${stats.pending} leads pending enrichment.`,
      confidence: 1.0,
    };
  }

  if (stats.enriched > 0 && stats.pending === 0) {
    return {
      action: "verify_emails",
      toolsToTry: ["millionverifier", "reoon"],
      reasoning: `${stats.enriched} enriched leads ready for verification.`,
      confidence: 1.0,
    };
  }

  if (stats.verified > 0 && stats.enriched === 0 && stats.pending === 0) {
    return {
      action: "generate_content",
      toolsToTry: ["openai", "groq"],
      reasoning: `${stats.verified} verified leads ready for content.`,
      confidence: 1.0,
    };
  }

  if (stats.personalized > 0 && stats.verified === 0 && stats.enriched === 0 && stats.pending === 0) {
    return {
      action: "send_campaign",
      toolsToTry: ["resend", "instantly"],
      reasoning: `${stats.personalized} personalized leads ready to send.`,
      confidence: 1.0,
    };
  }

  return null;
}

const ROUTER_LOG_PREFIX = "\x1b[35m[agent-router]\x1b[0m";

function logRouterBranch(
  agentId: string,
  fromNode: string,
  state: AgentState,
  next: string,
  pickReason: string,
): void {
  const reasoning =
    state.lastDecision?.reasoning?.replace(/\s+/g, " ").trim().slice(0, 320) ?? "(no decision yet)";
  const stagnationInfo = state.lastStagnationSignature 
    ? ` [stagnation_sig=${state.lastStagnationSignature} count=${state.stagnationRepeatCount}]`
    : "";
  console.log(
    `${ROUTER_LOG_PREFIX} agent=${agentId} from=${fromNode} iteration=${state.iteration} hops=${state.graphHopCount}/${state.config.maxGraphHops ?? "default"} → ${next} | ${pickReason}${stagnationInfo} | llm_reasoning: ${reasoning}`,
  );
}

/** Outcome fingerprint when the pipeline did not advance (empty tool result or error). */
function stagnationSignatureFromExecution(params: {
  action: string;
  lastResult: ToolExecutionResult | null;
}): string | null {
  const { action, lastResult } = params;
  if (!lastResult) return null;
  const meta = (lastResult.metadata ?? {}) as Record<string, unknown>;
  if (lastResult.metadata && meta.reason === "no_contacts_found") {
    return "graceful:no_contacts";
  }
  if (!lastResult.success) {
    return `err:${action}:${lastResult.tool}:${lastResult.error ?? "unknown"}`;
  }
  if (lastResult.leadsProcessed === 0) {
    return `noop:${action}:${lastResult.tool}:${String(meta.reason ?? "")}:${meta.skipped ? "skipped" : "zero"}`;
  }
  return null;
}

function nextStagnationState(
  state: AgentState,
  signature: string | null,
  maxRepeats: number,
): {
  lastStagnationSignature: string | null;
  stagnationRepeatCount: number;
  paused?: boolean;
  errors?: string[];
} {
  if (signature === null) {
    return { lastStagnationSignature: null, stagnationRepeatCount: 0 };
  }
  if (signature === state.lastStagnationSignature) {
    const nextCount = state.stagnationRepeatCount + 1;
    if (nextCount >= maxRepeats) {
      return {
        lastStagnationSignature: signature,
        stagnationRepeatCount: nextCount,
        paused: true,
        errors: [
          `Stagnation circuit: identical empty/error outcome ${maxRepeats}x (signature=${signature}). Stopping.`,
        ],
      };
    }
    return { lastStagnationSignature: signature, stagnationRepeatCount: nextCount };
  }
  return { lastStagnationSignature: signature, stagnationRepeatCount: 1 };
}

// ─── runOutboundAgent ─────────────────────────────────────────────────────────

/**
 * Main entry point. Compiles a LangGraph StateGraph and invokes it.
 * The graph runs: decide → guard → execute → postExec → decide (loop).
 */
export async function runOutboundAgent(
  config: AgentConfig,
  initialLeadBatch: LeadBatch,
): Promise<AgentOutcome> {
  const agentId   = config.agentId ?? randomUUID();
  const memory    = new AgentMemory(config.campaignId, agentId, config.orgId);
  const startTime = Date.now();

  const maxGraphHops = config.maxGraphHops ?? Math.min(40, Math.max(20, config.maxIterations * 4));
  const maxStagnationRepeats = config.maxStagnationRepeats ?? 2;
  /** Secondary safety cap after logic fixes; set to 50 as requested. */
  const recursionLimit = 50;

  await initializeMcpClient();

  // One LLM instance per run — respects config.temperature
  const llm           = new ChatGroq({ 
    model: "llama-3.3-70b-versatile", 
    temperature: config.temperature, 
    apiKey: process.env.GROQ_API_KEY,
    maxTokens: 512,
    maxRetries: 2
  });
  const decisionChain = decisionPromptTemplate.pipe(llm).pipe(decisionParser);

  console.log(`\x1b[36m[agent ${agentId}]\x1b[0m Starting with ${initialLeadBatch.leads.length} leads`);

  // ─── Node: decide ────────────────────────────────────────────────────────
  async function decideNode(state: AgentState): Promise<Partial<AgentState>> {
    if (state.iteration >= state.config.maxIterations) {
      console.log(
        `\x1b[33m[agent ${state.agentId}]\x1b[0m Max iterations (${state.config.maxIterations}) reached — exiting graph`,
      );
      return {
        paused: true,
        graphHopCount: 1,
        errors: [
          `Max agent iterations (${state.config.maxIterations}) reached — stopping to avoid cycling without progress.`,
        ],
      };
    }

    if (isAgentPauseRequested(state.agentId)) {
      console.log(`\x1b[33m[agent ${state.agentId}]\x1b[0m Pause requested by API, stopping`);
      return { paused: true, graphHopCount: 1 };
    }

    // Deterministic fast-path: skip the LLM when the pipeline state is unambiguous.
    // This prevents the LLM from hallucinating the wrong action (e.g. looping on
    // enrich_leads when there are no pending leads).
    const forcedDecision = forcedTransition(buildLeadStats(state.leads));
    if (forcedDecision) {
      console.log(
        `\x1b[36m[agent ${state.agentId}:${state.iteration}]\x1b[0m Forced decision (no LLM): ${forcedDecision.action}`,
      );
      return {
        lastDecision: forcedDecision,
        iteration:    state.iteration + 1,
        memories:     "No prior campaign history.",
        decisions:    [forcedDecision],
        graphHopCount: 1,
      };
    }

    const memories = config.enableLearning
      ? await memory.recallLearnedPatterns()
      : "No prior campaign history.";

    let lastDecision: AgentDecision;
    try {
      lastDecision = await decisionChain.invoke({
        campaignId:      String(state.config.campaignId),
        campaignName:    state.config.campaignName    ?? "Outbound Campaign",
        campaignType:    state.config.campaignType    ?? "outbound",
        campaignSubject: state.config.campaignSubject ?? "Not specified",
        iteration:       String(state.iteration + 1),
        leadStats:       JSON.stringify(buildLeadStats(state.leads)),
        totalCostUsd:    state.totalCostUsd.toFixed(2),
        memories,
      });
    } catch (err) {
      const msg = `LLM decision failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`\x1b[31m[agent ${state.agentId}]\x1b[0m ${msg}`);
      return { paused: true, graphHopCount: 1, errors: [msg] };
    }

    console.log(
      `\x1b[36m[agent ${state.agentId}:${state.iteration}]\x1b[0m Decision: ${lastDecision.action} (confidence: ${lastDecision.confidence})`,
    );
    return {
      lastDecision,
      iteration: state.iteration + 1,
      memories,
      decisions: [lastDecision],
      graphHopCount: 1,
    };
  }

  // ─── Node: guard ─────────────────────────────────────────────────────────
  async function guardNode(state: AgentState): Promise<Partial<AgentState>> {
    if (!state.lastDecision) return { paused: true, graphHopCount: 1 };

    let trustOk  = true;
    let budgetOk = true;

    if (mcpClientReady) {
      // Trust gate
      try {
        const trustResult = (await callMcpTool(
          "validateAgentCapability",
          { agentId: state.agentId, action: state.lastDecision.action },
          { allowed: true, reason: "MCP unavailable" },
        )) as { allowed?: boolean; reason?: string };
        trustOk = trustResult.allowed ?? true;
        if (!trustOk) {
          console.log(`\x1b[33m[agent ${state.agentId}]\x1b[0m Trust gate rejected: ${trustResult.reason}`);
        }
      } catch (err) {
        console.warn(`\x1b[33m[agent ${state.agentId}]\x1b[0m Trust check failed:`, err instanceof Error ? err.message : String(err));
      }

      // Budget guard
      const estimatedCost = state.lastDecision.metrics?.estimatedCostUsd ?? 0;
      if (estimatedCost > 0) {
        try {
          const budgetResult = (await callMcpTool(
            "checkSpendBudget",
            {
              orgId:            state.config.orgId,
              campaignId:       state.config.campaignId,
              estimatedCostUsd: estimatedCost,
            },
            { allowed: true, reason: "MCP unavailable" },
          )) as { allowed?: boolean; reason?: string };
          budgetOk = budgetResult.allowed ?? true;
          if (!budgetOk) {
            console.log(`\x1b[33m[agent ${state.agentId}]\x1b[0m Budget guard rejected: ${budgetResult.reason}`);
          }
        } catch (err) {
          console.warn(`\x1b[33m[agent ${state.agentId}]\x1b[0m Budget check failed:`, err instanceof Error ? err.message : String(err));
        }
      }
    }

    if (!trustOk || !budgetOk) {
      console.log(`\x1b[31m[agent ${state.agentId}]\x1b[0m Control guards rejected action, pausing`);
      return {
        paused: true,
        graphHopCount: 1,
        errors: [`Guards rejected action (trust=${trustOk}, budget=${budgetOk})`],
      };
    }

    return { graphHopCount: 1 };
  }

  // ─── Node: execute ────────────────────────────────────────────────────────
  async function executeNode(state: AgentState): Promise<Partial<AgentState>> {
    const { agentId: aid, config: cfg, leads, lastDecision, iteration } = state;
    if (!lastDecision) return { graphHopCount: 1 };

    const statsBefore = buildLeadStats(leads);
    let lastResult: ToolExecutionResult | null = null;
    // Captures a graceful "no contacts found" result from source_leads so we
    // don't treat it as a hard failure (which would mark campaign "failed").
    let gracefulResult: ToolExecutionResult | null = null;
    // Captures the last non-success result so we can inspect its metadata reason
    // and redirect the agent when a tool reports a state mismatch (e.g. no_pending_leads).
    let lastFailedResult: ToolExecutionResult | null = null;
    let newLeads = leads;
    let addedCost = 0;

    for (const tool of lastDecision.toolsToTry) {
      try {
        const result = await executeAgentTool(
          lastDecision.action,
          tool,
          { campaignId: cfg.campaignId, leads },
          cfg.orgId,
          {
            campaignName:    cfg.campaignName,
            campaignType:    cfg.campaignType,
            campaignSubject: cfg.campaignSubject,
            userId:          cfg.userId,
          },
        );

        if (result.success) {
          lastResult = result;
          addedCost  = result.costUsd;
          newLeads   = applyLeadTransition(leads, lastDecision.action);

          // Sync campaign.leadCount after new leads are sourced
          if (lastDecision.action === "source_leads" && result.leadsProcessed > 0) {
            try {
              const [countRow] = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(campaignLeadsTable)
                .where(eq(campaignLeadsTable.campaignId, cfg.campaignId));
              const newCount = Number(countRow?.count ?? result.leadsProcessed);
              await db
                .update(campaignsTable)
                .set({ leadCount: newCount })
                .where(eq(campaignsTable.id, cfg.campaignId));
              console.log(`\x1b[32m[agent ${aid}:${iteration}]\x1b[0m campaign.leadCount → ${newCount}`);
            } catch (err) {
              console.warn(
                `\x1b[33m[agent ${aid}]\x1b[0m leadCount update failed:`,
                err instanceof Error ? err.message : String(err),
              );
            }
          }

          console.log(`\x1b[32m[agent ${aid}:${iteration}]\x1b[0m Tool ${tool} succeeded: ${result.leadsProcessed} leads`);
          break;
        }

        lastFailedResult = result;

        // source_leads returning 0 is not a pipeline error — capture for post-loop handling
        if (
          lastDecision.action === "source_leads" &&
          result.metadata &&
          (result.metadata as Record<string, unknown>).reason === "no_contacts_found"
        ) {
          gracefulResult = result;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`\x1b[33m[agent ${aid}:${iteration}]\x1b[0m Tool ${tool} failed: ${msg}, trying next…`);
      }
    }

    if (!lastResult && gracefulResult) {
      lastResult = gracefulResult;
      console.log(
        `\x1b[33m[agent ${aid}:${iteration}]\x1b[0m source_leads: 0 contacts — using graceful result for stagnation tracking`,
      );
    }

    const allToolsFailed = !lastResult;

    if (allToolsFailed) {
      const failMsg = `All tools failed for action ${lastDecision.action}`;
      console.log(`\x1b[31m[agent ${aid}:${iteration}]\x1b[0m ${failMsg}`);

      // Safety-net redirect: if enrich_leads reported no pending leads the LLM
      // chose the wrong action.  Force verify_emails so the next decideNode fast-path
      // can take over instead of asking the LLM again and risking the same loop.
      const failReason = (lastFailedResult?.metadata as Record<string, unknown> | undefined)
        ?.reason as string | undefined;
      if (failReason === "no_pending_leads") {
        const redirectDecision: AgentDecision = {
          action:      "verify_emails",
          toolsToTry:  ["millionverifier", "reoon"],
          reasoning:   "Redirected: no pending leads — advancing to verify_emails.",
          confidence:  1.0,
        };
        console.log(
          `\x1b[33m[agent ${aid}:${iteration}]\x1b[0m no_pending_leads → redirecting next decision to verify_emails`,
        );
        return {
          lastDecision:            redirectDecision,
          lastResult:              lastFailedResult,
          leads:                   newLeads,
          errors:                  [failMsg],
          graphHopCount:           1,
          lastStagnationSignature: null,
          stagnationRepeatCount:   0,
        };
      }

      // Do not apply stagnation here: the signature would be identical every time and would
      // stop the agent after 2 iterations — killing repeated Apollo endpoint sweeps and verbose
      // tool logs during debugging. Hard failures are bounded by maxIterations + graphHopCount.
      return {
        lastResult:              null,
        leads:                   newLeads,
        errors:                  [failMsg],
        graphHopCount:           1,
        lastStagnationSignature: null,
        stagnationRepeatCount:   0,
      };
    }

    const statsAfter = buildLeadStats(newLeads);
    const leadProgress   = JSON.stringify(statsBefore) !== JSON.stringify(statsAfter);
    const toolProgress   = Boolean(
      lastResult && lastResult.success && lastResult.leadsProcessed > 0,
    );
    const madeProgress   = leadProgress || toolProgress;

    if (madeProgress) {
      return {
        lastResult,
        leads:                   newLeads,
        totalCostUsd:            addedCost,
        graphHopCount:           1,
        lastStagnationSignature: null,
        stagnationRepeatCount:   0,
      };
    }

    const sig = stagnationSignatureFromExecution({
      action: lastDecision.action,
      lastResult,
    });
    const st = nextStagnationState(state, sig, maxStagnationRepeats);
    const base: Partial<AgentState> = {
      lastResult,
      leads:                   newLeads,
      totalCostUsd:            addedCost,
      graphHopCount:           1,
      lastStagnationSignature: st.lastStagnationSignature,
      stagnationRepeatCount:   st.stagnationRepeatCount,
    };
    if (st.paused) {
      return { ...base, paused: true, errors: st.errors };
    }
    return base;
  }

  // ─── Node: postExec ───────────────────────────────────────────────────────
  async function postExecNode(state: AgentState): Promise<Partial<AgentState>> {
    const { agentId: aid, config: cfg, lastDecision, lastResult } = state;
    if (!lastDecision) return { graphHopCount: 1 };

    // Record spend to MCP ledger
    if (mcpClientReady && lastResult && lastResult.costUsd > 0) {
      try {
        await callMcpTool(
          "recordSpend",
          {
            orgId:      cfg.orgId,
            campaignId: cfg.campaignId,
            action:     `${lastDecision.action}_${lastResult.tool}`,
            amountUsd:  lastResult.costUsd,
            agentId:    aid,
          },
          { recorded: true },
        );
        console.log(`\x1b[32m[agent ${aid}]\x1b[0m Spend recorded: $${lastResult.costUsd.toFixed(3)}`);
      } catch (err) {
        console.warn(`\x1b[33m[agent ${aid}]\x1b[0m recordSpend failed:`, err instanceof Error ? err.message : String(err));
      }
    }

    // Persist to agent memory
    if (cfg.enableLearning) {
      await memory.recordDecision(lastDecision);
      if (lastResult) await memory.recordOutcome(lastDecision.action, lastResult);
    }

    return { graphHopCount: 1 };
  }

  // ─── Graph wiring ─────────────────────────────────────────────────────────
  function routeAfterDecide(state: AgentState): typeof END | "guard" {
    if (state.paused) {
      logRouterBranch(agentId, "decide", state, "__end__", "paused (state.paused=true)");
      return END;
    }
    const action = state.lastDecision?.action;
    if (action === "pause" || action === "complete") {
      logRouterBranch(agentId, "decide", state, "__end__", `terminal action=${action}`);
      return END;
    }
    if (state.graphHopCount >= maxGraphHops) {
      logRouterBranch(agentId, "decide", state, "__end__", `circuit: graphHopCount threshold reached (${maxGraphHops})`);
      return END;
    }
    logRouterBranch(agentId, "decide", state, "guard", "continue to guard → execute");
    return "guard";
  }

  function routeAfterGuard(state: AgentState): typeof END | "execute" {
    if (state.paused) {
      logRouterBranch(agentId, "guard", state, "__end__", "paused after trust/budget guards");
      return END;
    }
    if (state.graphHopCount >= maxGraphHops) {
      logRouterBranch(agentId, "guard", state, "__end__", `circuit: graphHopCount threshold reached (${maxGraphHops})`);
      return END;
    }
    logRouterBranch(agentId, "guard", state, "execute", "guards passed");
    return "execute";
  }

  function routeAfterExecute(state: AgentState): typeof END | "postExec" {
    if (state.paused) {
      logRouterBranch(agentId, "execute", state, "__end__", "paused (stagnation / failure policy)");
      return END;
    }
    const allDone = state.leads.every((l) => l.status === "sent" || l.status === "failed");
    if (allDone) {
      logRouterBranch(agentId, "execute", state, "__end__", "all leads terminal (sent/failed)");
      return END;
    }
    if (state.graphHopCount >= maxGraphHops) {
      logRouterBranch(agentId, "execute", state, "__end__", `circuit: graphHopCount threshold reached (${maxGraphHops})`);
      return END;
    }
    logRouterBranch(agentId, "execute", state, "postExec", "pipeline not finished — continuing");
    return "postExec";
  }

  const graph = new StateGraph(AgentStateAnnotation)
    .addNode("decide",   decideNode)
    .addNode("guard",    guardNode)
    .addNode("execute",  executeNode)
    .addNode("postExec", postExecNode)
    .addEdge(START, "decide")
    .addConditionalEdges("decide", routeAfterDecide)
    .addConditionalEdges("guard", routeAfterGuard)
    .addConditionalEdges("execute", routeAfterExecute)
    .addEdge("postExec", "decide")
    .compile();

  // ─── Initial state ────────────────────────────────────────────────────────
  const initialState: AgentState = {
    leads:                     initialLeadBatch.leads,
    config,
    agentId,
    memories:                  "No prior campaign history.",
    decisions:                 [],
    totalCostUsd:              0,
    errors:                    [],
    iteration:                 0,
    lastDecision:              null,
    lastResult:                null,
    paused:                    false,
    graphHopCount:             0,
    lastStagnationSignature:   null,
    stagnationRepeatCount:     0,
  };

  let finalState = initialState;
  try {
    finalState = await graph.invoke(initialState, {
      recursionLimit,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31m[agent ${agentId}]\x1b[0m Graph error: ${msg}`);
    finalState = { ...initialState, errors: [msg] };
  }

  // ─── Build and return outcome ─────────────────────────────────────────────
  const executionTimeMs = Date.now() - startTime;
  const successCount    = finalState.leads.filter((l) => l.status === "sent").length;
  const failCount       = finalState.leads.filter((l) => l.status === "failed").length;
  const allLeadsTerminal = finalState.leads.every(
    (l) => l.status === "sent" || l.status === "failed",
  );
  const hitHopCap =
    finalState.graphHopCount >= maxGraphHops && !finalState.paused && !allLeadsTerminal;
  const mergedErrors = [
    ...finalState.errors,
    ...(hitHopCap
      ? [
          `Graph circuit: node visit cap (${maxGraphHops}) reached before pipeline finished (recursionLimit=${recursionLimit}).`,
        ]
      : []),
  ];

  const outcome: AgentOutcome = {
    campaignId:      config.campaignId,
    agentId,
    status:          mergedErrors.length > 0 ? "failed" : successCount > 0 ? "completed" : "paused",
    totalIterations: finalState.decisions.length,
    leadsProcessed:  finalState.leads.length,
    leadsSuccessful: successCount,
    leadsFailed:     failCount,
    totalCostUsd:    finalState.totalCostUsd,
    executionTimeMs,
    memory:          await memory.snapshot(),
    decisions:       finalState.decisions,
    errors:          mergedErrors.length > 0 ? mergedErrors : undefined,
  };

  console.log(
    `\x1b[36m[agent ${agentId}]\x1b[0m Completed: ${successCount}/${finalState.leads.length} sent, cost: $${finalState.totalCostUsd.toFixed(2)}`,
  );
  clearAgentPause(agentId);

  return outcome;
}

/** Cleanup MCP client when shutting down the application. */
export async function cleanupMcpClient(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mcp = await import("../../mcp-agent-orchestrator/dist/index.js" as any);
    if ((mcp as { closeMcpClient?: () => Promise<void> }).closeMcpClient) {
      await (mcp as { closeMcpClient: () => Promise<void> }).closeMcpClient();
    }
    mcpClientReady = false;
    mcpClientInitialized = false;
    console.log(`\x1b[36m[MCP]\x1b[0m Client closed`);
  } catch (err) {
    console.warn(`\x1b[33m[MCP]\x1b[0m Error closing client:`, err);
  }
}
