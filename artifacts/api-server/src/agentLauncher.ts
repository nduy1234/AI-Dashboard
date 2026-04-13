/**
 * Shared agent launcher
 * Owns the in-memory activeRuns registry and exposes launchAgentForCampaign()
 * so both the /agents/start-outbound route and /campaigns route can trigger
 * the autonomous agent with identical logic.
 */

import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import {
  db,
  agentLogsTable,
  campaignsTable,
  campaignLeadsTable,
  leadsTable,
} from "@workspace/db";
import type { OwnerContext } from "./security/ownerContext.js";
import { notifyCampaignCompleted } from "./lib/slackClient.js";
import { pipelineEmitter } from "./lib/pipelineEmitter.js";

// ─── Active-run registry ──────────────────────────────────────────────────────

export const activeRuns = new Map<
  string,
  {
    campaignId: number;
    orgId: number | null;
    userId: string;
    status: "running" | "pause_requested" | "paused" | "completed" | "failed";
    startedAt: string;
    completedAt?: string;
    error?: string;
    outcome?: {
      leadsProcessed: number;
      leadsSuccessful: number;
      totalCostUsd: number;
      totalIterations: number;
      executionTimeMs: number;
    };
  }
>();

// ─── Lead status helper ───────────────────────────────────────────────────────

export function toAgentLeadStatus(
  status: string | null | undefined,
): "pending" | "enriched" | "verified" | "personalized" | "sent" | "failed" {
  if (
    status === "enriched" ||
    status === "verified" ||
    status === "personalized" ||
    status === "sent" ||
    status === "failed"
  ) {
    return status;
  }
  return "pending";
}

// ─── Core launcher ────────────────────────────────────────────────────────────

export interface LaunchOptions {
  campaignId: number;
  owner: OwnerContext;
  maxIterations?: number;
  enableLearning?: boolean;
}

export interface LaunchResult {
  agentId: string;
  leadsLoaded: number;
}

/**
 * Start the autonomous outbound agent for a campaign.
 * - Marks the campaign as active immediately.
 * - Fires `runOutboundAgent` in the background.
 * - Registers the run in `activeRuns`.
 * - Updates `activeRuns` and campaign status when the run finishes.
 */
export async function launchAgentForCampaign({
  campaignId,
  owner,
  maxIterations = 10,
  enableLearning = true,
}: LaunchOptions): Promise<LaunchResult> {
  const agentId = randomUUID();

  // Build ownership filter (orgId may be null for personal accounts)
  const ownershipFilter =
    owner.orgId != null
      ? or(
          eq(campaignsTable.orgId, owner.orgId),
          eq(campaignsTable.userId, owner.userId),
        )
      : eq(campaignsTable.userId, owner.userId);

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, campaignId), ownershipFilter))
    .limit(1);

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found for this organisation`);
  }

  // Emit: campaign record confirmed, pipeline starting
  pipelineEmitter.emitStep(campaignId, "campaign_created", campaign.name);

  const config = {
    orgId:           owner.orgId,
    userId:          owner.userId,
    campaignId,
    agentId,
    campaignName:    campaign.name,
    campaignType:    campaign.type,
    campaignSubject: campaign.subject ?? undefined,
    maxIterations,
    temperature:     0.3 as const,
    enableLearning:  Boolean(enableLearning),
  };

  // Emit: config built, about to load leads
  pipelineEmitter.emitStep(campaignId, "agent_initializing");

  // Load any pre-existing leads for this campaign
  const campaignLeadRows = await db
    .select({
      id:          leadsTable.id,
      email:       leadsTable.email,
      firstName:   leadsTable.firstName,
      lastName:    leadsTable.lastName,
      company:     leadsTable.company,
      title:       leadsTable.title,
      industry:    leadsTable.industry,
      companySize: leadsTable.companySize,
      linkedinUrl: leadsTable.linkedinUrl,
      status:      campaignLeadsTable.status,
    })
    .from(campaignLeadsTable)
    .innerJoin(leadsTable, eq(leadsTable.id, campaignLeadsTable.leadId))
    .where(eq(campaignLeadsTable.campaignId, campaignId));

  const initialLeads = {
    campaignId,
    leads: campaignLeadRows.map((lead) => ({
      id:          lead.id,
      email:       lead.email,
      firstName:   lead.firstName,
      lastName:    lead.lastName,
      company:     lead.company,
      title:       lead.title,
      industry:    lead.industry    ?? undefined,
      companySize: lead.companySize ?? undefined,
      linkedinUrl: lead.linkedinUrl ?? undefined,
      status:      toAgentLeadStatus(lead.status),
    })),
  };

  console.log(`[Agent] Launching agent ${agentId} for campaign ${campaignId} (${initialLeads.leads.length} pre-loaded leads)`);

  // Emit: leads are now loaded and known
  pipelineEmitter.emitStep(campaignId, "leads_loaded", `${initialLeads.leads.length} lead(s) queued`);

  // Flip campaign → active immediately
  await db
    .update(campaignsTable)
    .set({ status: "active", launchedAt: new Date() })
    .where(eq(campaignsTable.id, campaignId));

  activeRuns.set(agentId, {
    campaignId,
    orgId:     owner.orgId,
    userId:    owner.userId,
    status:    "running",
    startedAt: new Date().toISOString(),
  });

  // ── Background execution ──────────────────────────────────────────────────
  void (async () => {
    try {
      // Emit: agent is now initialising
      pipelineEmitter.emitStep(campaignId, "agent_running");

      // Simulate mid-run progress steps with realistic delays so the UI
      // shows meaningful advancement even though runOutboundAgent is a black box.
      let midStepTimer1: ReturnType<typeof setTimeout>;
      let midStepTimer2: ReturnType<typeof setTimeout>;
      let midStepTimer3: ReturnType<typeof setTimeout>;
      const clearMidStepTimers = () => {
        clearTimeout(midStepTimer1);
        clearTimeout(midStepTimer2);
        clearTimeout(midStepTimer3);
      };
      midStepTimer1 = setTimeout(() => pipelineEmitter.emitStep(campaignId, "enriching_leads"),    2_500);
      midStepTimer2 = setTimeout(() => pipelineEmitter.emitStep(campaignId, "generating_sequences"), 5_500);
      midStepTimer3 = setTimeout(() => pipelineEmitter.emitStep(campaignId, "sending_outreach"),    9_000);

      // In dev, load TS source so logs and tool behavior match the repo without a separate
      // `pnpm --filter @workspace/agent-orchestration build` watch.
      const orchestrationEntry =
        process.env.NODE_ENV === "development"
          ? "../../../lib/agent-orchestration/src/index.ts"
          : "../../../lib/agent-orchestration/dist/index.js";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import(orchestrationEntry as any);
      if (!mod.runOutboundAgent) throw new Error("runOutboundAgent not available");

      const outcome = await mod.runOutboundAgent(config, initialLeads);

      // Clear timed simulation timers — real outcome arrived
      clearMidStepTimers();

      const current = activeRuns.get(agentId);
      if (current) {
        activeRuns.set(agentId, {
          ...current,
          status:      outcome.status,
          completedAt: new Date().toISOString(),
          outcome,
        });
      }

      const campaignFinalStatus =
        outcome.status === "completed" ? "completed"
        : outcome.status === "paused"  ? "paused"
        : "failed";

      await db
        .update(campaignsTable)
        .set({
          status:    campaignFinalStatus,
          sentCount: outcome.leadsSuccessful,
          leadCount: outcome.leadsProcessed,
        })
        .where(eq(campaignsTable.id, campaignId));

      await db.insert(agentLogsTable).values({
        agentType: "outbound",
        action:    "campaign_executed",
        status:    outcome.status,
        details:   `Campaign ${campaignId}: ${outcome.leadsSuccessful} successful, ${outcome.leadsFailed} failed`,
        metadata:  {
          agentId:    outcome.agentId,
          campaignId,
          totalCost:  outcome.totalCostUsd,
          iterations: outcome.totalIterations,
        },
        userId: owner.userId,
        orgId:  owner.orgId,
      });

      // Emit terminal pipeline step
      const terminalStep =
        outcome.status === "completed" ? "completed"
        : outcome.status === "paused" ? "paused"
        : "failed";
      pipelineEmitter.emitStep(
        campaignId,
        terminalStep,
        `${outcome.leadsSuccessful} sent · ${outcome.leadsProcessed} processed`,
      );

      console.log(`[Agent] Agent ${agentId} finished with status: ${outcome.status}`);

      notifyCampaignCompleted({
        campaignName:    config.campaignName ?? `Campaign ${campaignId}`,
        status:          outcome.status,
        leadsSuccessful: outcome.leadsSuccessful,
        leadsFailed:     outcome.leadsFailed,
        totalCostUsd:    outcome.totalCostUsd,
        iterations:      outcome.totalIterations,
        errors:          outcome.errors,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      const current = activeRuns.get(agentId);
      if (current) {
        activeRuns.set(agentId, {
          ...current,
          status:      "failed",
          completedAt: new Date().toISOString(),
          error:       errMsg,
        });
      }

      // Stop timed progress steps so they don't fire after a failure
      clearMidStepTimers();
      pipelineEmitter.emitStep(campaignId, "failed", errMsg.slice(0, 120));

      await db
        .update(campaignsTable)
        .set({ status: "failed" })
        .where(eq(campaignsTable.id, campaignId))
        .catch(() => { /* non-fatal */ });

      await db.insert(agentLogsTable).values({
        agentType: "outbound",
        action:    "campaign_executed",
        status:    "failed",
        details:   `Campaign ${campaignId}: agent failed to execute`,
        metadata:  { agentId, campaignId, error: errMsg },
        userId:    owner.userId,
        orgId:     owner.orgId,
      });

      console.error(`[Agent] Agent ${agentId} failed:`, errMsg);

      notifyCampaignCompleted({
        campaignName:    `Campaign ${campaignId}`,
        status:          "failed",
        leadsSuccessful: 0,
        leadsFailed:     0,
        totalCostUsd:    0,
        iterations:      0,
        errors:          [errMsg],
      });
    }
  })();

  return { agentId, leadsLoaded: initialLeads.leads.length };
}
