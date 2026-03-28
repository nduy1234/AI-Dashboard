import type { OwnerContext } from "../security/ownerContext";
import { outboundMcpTools } from "../lib/outboundIntegrations";
import { outboundPhaseOneConfig } from "../lib/outboundConfig";
import {
  activateCampaign,
  completeOutboundJob,
  createAgentLog,
  createAnalyticsEvent,
  createEnrichmentAttempt,
  createJobAttempt,
  createLeadFromImport,
  createLeadScore,
  createLeadSourceRecord,
  createOutboundJob,
  createOutboundMessage,
  createSendingEvent,
  createVerificationResult,
  failOutboundJob,
  findExistingJobByIdempotency,
  getBestDomainForOwner,
  getCampaignEventCounts,
  getLeadPipeline as getLeadPipelineCounts,
  getLatestOutboundMessage,
  getJobAttemptCount,
  getOwnedCampaignById,
  getOwnedJobById,
  listOwnedLeadsByIds,
  markLeadEnriched,
  markLeadSent,
  markOutboundMessageSent,
  setJobRetryResult,
  updateLeadVerification,
  findLeadByEmailOwned,
  db,
} from "../repositories/outboundRepository";

export async function createOrGetJob(
  stage: string,
  payload: Record<string, unknown>,
  owner: OwnerContext,
  idempotencyKey: string | null,
) {
  if (idempotencyKey) {
    const existing = await findExistingJobByIdempotency(stage, idempotencyKey, owner);
    if (existing) return existing;
  }
  return createOutboundJob(stage, payload, owner, idempotencyKey);
}

export async function runImportJob(
  owner: OwnerContext,
  jobId: number,
  payload: {
    source: string;
    importType: string;
    leads?: Array<Record<string, unknown>>;
    filters?: Record<string, unknown>;
  },
) {
  try {
    const importedFromProvider = await outboundMcpTools.sourceImport(payload.source, payload);
    const incomingLeads = payload.leads ?? importedFromProvider;
    let imported = 0;
    let duplicates = 0;

    for (const lead of incomingLeads) {
      if (!lead.email || typeof lead.email !== "string") continue;
      const existing = await findLeadByEmailOwned(lead.email, owner);
      if (existing) {
        duplicates += 1;
        continue;
      }
      await createLeadFromImport(lead, payload.source, owner);
      imported += 1;
    }

    await createLeadSourceRecord(
      payload.source,
      payload.importType,
      payload.filters ?? {},
      imported,
      duplicates,
      owner,
    );
    const result = { imported, duplicates, total: imported + duplicates };
    await completeOutboundJob(jobId, result);
    return result;
  } catch (error) {
    await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown import error");
    throw error;
  }
}

export async function runEnrichJob(
  owner: OwnerContext,
  jobId: number,
  payload: { leadIds: number[]; provider: string },
) {
  try {
    const leads = await listOwnedLeadsByIds(payload.leadIds, owner);
    const enrichedLeadIds: number[] = [];

    for (const lead of leads) {
      const startedAt = Date.now();
      try {
        const enriched = await outboundMcpTools.enrich(payload.provider, {
          email: lead.email,
          company: lead.company,
          title: lead.title,
        });
        await createEnrichmentAttempt(lead.id, payload.provider, "success", {
          response: enriched,
          latencyMs: Date.now() - startedAt,
        });
        await markLeadEnriched(
          lead.id,
          {
            industry: lead.industry,
            companySize: lead.companySize,
            linkedinUrl: lead.linkedinUrl,
            notes: lead.notes,
          },
          enriched,
        );
        enrichedLeadIds.push(lead.id);
      } catch (error) {
        await createEnrichmentAttempt(lead.id, payload.provider, "failed", {
          error: error instanceof Error ? error.message : "Unknown enrichment failure",
          latencyMs: Date.now() - startedAt,
        });
      }
    }

    const result = { enriched: enrichedLeadIds.length, total: payload.leadIds.length };
    await completeOutboundJob(jobId, result);
    return result;
  } catch (error) {
    await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown enrich error");
    throw error;
  }
}

export async function runVerifyJob(
  owner: OwnerContext,
  jobId: number,
  payload: { leadIds: number[]; provider: string },
) {
  try {
    const leads = await listOwnedLeadsByIds(payload.leadIds, owner);
    let verified = 0;
    let invalid = 0;

    for (const lead of leads) {
      const result = await outboundMcpTools.verify(payload.provider, lead.email);
      const finalStatus = result.result === "valid" ? "verified" : result.result === "invalid" ? "invalid" : "review";
      await createVerificationResult(lead.id, payload.provider, result.result, result.reason, result);
      await updateLeadVerification(lead.id, result.result === "valid", finalStatus);
      if (result.result === "valid") verified += 1;
      if (result.result === "invalid") invalid += 1;
    }

    const response = { verified, invalid, total: payload.leadIds.length };
    await completeOutboundJob(jobId, response);
    return response;
  } catch (error) {
    await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown verify error");
    throw error;
  }
}

export async function runPersonalizeJob(
  owner: OwnerContext,
  jobId: number,
  payload: { leadIds: number[]; campaignId: number; provider: string; promptVersion: string },
) {
  try {
    const leads = await listOwnedLeadsByIds(payload.leadIds, owner);
    let generated = 0;

    for (const lead of leads) {
      const heuristicScore = Math.min(
        100,
        20 + (lead.verified ? 30 : 0) + (lead.industry ? 15 : 0) + (lead.companySize ? 10 : 0) + (lead.linkedinUrl ? 10 : 0),
      );
      const bucket = heuristicScore >= 75 ? "hot" : heuristicScore >= 45 ? "warm" : "cold";
      await createLeadScore(
        lead.id,
        heuristicScore,
        bucket,
        {
          verified: lead.verified,
          hasIndustry: !!lead.industry,
          hasCompanySize: !!lead.companySize,
          hasLinkedin: !!lead.linkedinUrl,
        },
        `heuristic-${payload.provider}`,
      );

      const subject = `Quick idea for ${lead.company}'s ${lead.title} team`;
      const body = [
        `Hi ${lead.firstName},`,
        "",
        `I noticed ${lead.company} is growing in ${lead.industry ?? "your space"}.`,
        "We help teams improve outbound conversion without adding SDR overhead.",
        "Would you be open to a 15-minute chat next week?",
      ].join("\n");
      await createOutboundMessage(payload.campaignId, lead.id, subject, body, payload.promptVersion);
      generated += 1;
    }

    const response = { generated, total: payload.leadIds.length };
    await completeOutboundJob(jobId, response);
    return response;
  } catch (error) {
    await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown personalize error");
    throw error;
  }
}

export async function runLaunchJob(
  owner: OwnerContext,
  jobId: number,
  payload: { campaignId: number; leadIds: number[]; provider: "instantly" | "smartlead" | "resend"; dailyCap: number },
) {
  try {
    const campaign = await getOwnedCampaignById(payload.campaignId, owner);
    if (!campaign) {
      await failOutboundJob(jobId, "Campaign not found");
      return null;
    }

    const leads = await listOwnedLeadsByIds(payload.leadIds, owner);
    const bestDomain = await getBestDomainForOwner(owner);
    let sent = 0;

    await db.transaction(async (tx: any) => {
      for (const lead of leads.slice(0, payload.dailyCap)) {
        const message = await getLatestOutboundMessage(payload.campaignId, lead.id);
        const finalMessage = message ?? {
          subject: campaign.subject ?? `Quick intro for ${lead.company}`,
          body: `Hi ${lead.firstName}, would love to share an idea for ${lead.company}.`,
        };

        const sendResult = await outboundMcpTools.send(payload.provider, {
          to: lead.email,
          subject: finalMessage.subject,
          body: finalMessage.body,
          fromDomain: bestDomain?.domain ?? null,
        });

        await markLeadSent(payload.campaignId, lead.id, tx);
        await createSendingEvent({
          campaignId: payload.campaignId,
          leadId: lead.id,
          provider: payload.provider,
          eventType: "sent",
          eventId: sendResult.externalMessageId,
          payload: { source: "launch_job" },
        }, tx);
        await markOutboundMessageSent(payload.campaignId, lead.id, payload.provider, sendResult.externalMessageId, tx);
        sent += 1;
      }

      await activateCampaign(campaign.id, sent, tx);
      await createAgentLog({
        agentType: "outbound",
        action: "launch_campaign",
        status: "completed",
        details: `Launch job sent ${sent} messages`,
        metadata: { campaignId: campaign.id, provider: payload.provider, sent },
        owner,
        executor: tx,
      });
    });

    const response = { sent, total: leads.length, provider: payload.provider };
    await completeOutboundJob(jobId, response);
    return response;
  } catch (error) {
    await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown launch error");
    throw error;
  }
}

export async function retryJob(owner: OwnerContext, jobId: number) {
  const job = await getOwnedJobById(jobId, owner);
  if (!job) return null;
  const nextAttempt = (await getJobAttemptCount(jobId)) + 1;
  await createJobAttempt(jobId, nextAttempt, owner.userId);
  await setJobRetryResult(jobId, nextAttempt);
  return { jobId, retried: true, attempt: nextAttempt };
}

export async function getOwnedJob(owner: OwnerContext, jobId: number) {
  return getOwnedJobById(jobId, owner);
}

export async function getLeadPipeline(owner: OwnerContext) {
  const counts = await getLeadPipelineCounts(owner);
  return {
    sourced: counts?.sourced ?? 0,
    enriched: counts?.enriched ?? 0,
    verified: counts?.verified ?? 0,
    invalid: counts?.invalid ?? 0,
    review: counts?.review ?? 0,
    total: counts?.total ?? 0,
  };
}

export async function getCampaignPerformance(owner: OwnerContext, campaignId: number) {
  const campaign = await getOwnedCampaignById(campaignId, owner);
  if (!campaign) return null;

  const eventCounts = await getCampaignEventCounts(campaignId);
  const sent = eventCounts?.sent ?? campaign.sentCount;
  const opened = eventCounts?.opened ?? campaign.openCount;
  const replied = eventCounts?.replied ?? campaign.replyCount;
  const positiveReplies = eventCounts?.positiveReplies ?? 0;
  const meetingsBooked = eventCounts?.meetingsBooked ?? campaign.meetingsBooked;
  const bounces = eventCounts?.bounces ?? 0;
  const pct = (numerator: number, denominator: number) =>
    denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;

  await createAnalyticsEvent({
    userId: owner.userId,
    orgId: owner.orgId,
    eventType: "outbound_performance_read",
    entityType: "campaign",
    entityId: campaignId,
    metadata: { sent, opened, replied },
  });

  return {
    campaignId,
    sent,
    opened,
    replied,
    positiveReplies,
    bounces,
    meetingsBooked,
    deliveryRate: pct(sent - bounces, sent),
    openRate: pct(opened, sent),
    replyRate: pct(replied, sent),
    positiveReplyRate: pct(positiveReplies, sent),
    meetingRate: pct(meetingsBooked, sent),
  };
}

export async function runPilot(owner: OwnerContext, campaignId: number) {
  const campaign = await getOwnedCampaignById(campaignId, owner);
  if (!campaign) return null;

  const eventCounts = await getCampaignEventCounts(campaignId);
  const sent = eventCounts?.sent ?? campaign.sentCount;
  const opened = eventCounts?.opened ?? campaign.openCount;
  const replied = eventCounts?.replied ?? campaign.replyCount;
  const positiveReplies = eventCounts?.positiveReplies ?? 0;
  const pct = (numerator: number, denominator: number) =>
    denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;

  const metrics = {
    openRate: pct(opened, sent),
    replyRate: pct(replied, sent),
    positiveReplyRate: pct(positiveReplies, sent),
    sent,
    opened,
    replied,
    positiveReplies,
  };

  const targets = outboundPhaseOneConfig.kpiTargets;
  const checks = {
    openRate: metrics.openRate >= targets.minimumOpenRatePct,
    replyRate: metrics.replyRate >= targets.minimumReplyRatePct,
    positiveReplyRate: metrics.positiveReplyRate >= targets.minimumPositiveReplyRatePct,
  };

  await createAnalyticsEvent({
    userId: owner.userId,
    orgId: owner.orgId,
    eventType: "outbound_pilot_run",
    entityType: "campaign",
    entityId: campaignId,
    metadata: { metrics, checks, targets },
  });

  return {
    campaignId,
    metrics,
    targets,
    checks,
    passed: checks.openRate && checks.replyRate && checks.positiveReplyRate,
  };
}
