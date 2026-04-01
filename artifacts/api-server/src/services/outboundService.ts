import type { OwnerContext } from "../security/ownerContext";
import { launchInstantlyCampaign, outboundMcpTools } from "../lib/outboundIntegrations";
import { isOutboundProviderEnabled, outboundPhaseOneConfig } from "../lib/outboundConfig";
import { notifyCampaignLaunched } from "../lib/slackClient";
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
  getJobById,
  setOutboundJobStatus,
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
      const launchLeads = leads.slice(0, payload.dailyCap);

      if (payload.provider === "instantly") {
        const firstMessage = launchLeads.length > 0
          ? await getLatestOutboundMessage(payload.campaignId, launchLeads[0]!.id)
          : null;
        const fallbackSubject = firstMessage?.subject ?? campaign.subject ?? `Quick intro for ${campaign.name}`;
        const fallbackBody = firstMessage?.body ?? "Hi, sharing a quick idea for your growth goals.";
        const instantlyLaunch = await launchInstantlyCampaign({
          campaignName: campaign.name,
          subject: fallbackSubject,
          body: fallbackBody,
          leads: launchLeads.map((lead) => ({
            email: lead.email,
            firstName: lead.firstName,
            lastName: lead.lastName,
            company: lead.company,
          })),
          fromDomain: bestDomain?.domain ?? null,
        });

        for (const lead of launchLeads) {
          await markLeadSent(payload.campaignId, lead.id, tx);
          await createSendingEvent({
            campaignId: payload.campaignId,
            leadId: lead.id,
            provider: payload.provider,
            eventType: "sent",
            eventId: `${instantlyLaunch.externalMessageId}:${lead.id}`,
            payload: { source: "launch_job", mode: "campaign" },
          }, tx);
          await markOutboundMessageSent(
            payload.campaignId,
            lead.id,
            payload.provider,
            instantlyLaunch.externalMessageId,
            tx,
          );
          sent += 1;
        }
      } else {
        for (const lead of launchLeads) {
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
      }

      await activateCampaign(campaign.id, sent, tx);
      notifyCampaignLaunched(campaign.name, sent);
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
  await setOutboundJobStatus(jobId, "queued");
  await setJobRetryResult(jobId, nextAttempt);
  return { jobId, retried: true, attempt: nextAttempt, status: "queued" };
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

export async function processOutboundJobById(jobId: number): Promise<void> {
  const job = await getJobById(jobId);
  if (!job) return;
  if (!job.userId) {
    await setOutboundJobStatus(jobId, "failed");
    await failOutboundJob(jobId, "Job has no user context");
    return;
  }

  const owner: OwnerContext = {
    userId: job.userId,
    orgId: job.orgId ?? null,
  };

  const input = (job.input ?? {}) as Record<string, unknown>;
  await setOutboundJobStatus(jobId, "processing");

  switch (job.stage) {
    case "import":
      await runImportJob(owner, jobId, {
        source: String(input.source ?? "apollo"),
        importType: String(input.importType ?? "manual"),
        leads: Array.isArray(input.leads) ? (input.leads as Array<Record<string, unknown>>) : undefined,
        filters: typeof input.filters === "object" && input.filters ? (input.filters as Record<string, unknown>) : undefined,
      });
      return;
    case "enrich":
      {
        const requestedProvider = String(input.provider ?? "clay");
        const provider = isOutboundProviderEnabled(requestedProvider) ? requestedProvider : "manual_fallback";
      await runEnrichJob(owner, jobId, {
        leadIds: Array.isArray(input.leadIds) ? input.leadIds.map((value) => Number(value)).filter(Number.isFinite) : [],
        provider,
      });
      return;
      }
    case "verify":
      await runVerifyJob(owner, jobId, {
        leadIds: Array.isArray(input.leadIds) ? input.leadIds.map((value) => Number(value)).filter(Number.isFinite) : [],
        provider: String(input.provider ?? "millionverifier"),
      });
      return;
    case "personalize":
      await runPersonalizeJob(owner, jobId, {
        leadIds: Array.isArray(input.leadIds) ? input.leadIds.map((value) => Number(value)).filter(Number.isFinite) : [],
        campaignId: Number(input.campaignId ?? 0),
        provider: String(input.provider ?? "openai"),
        promptVersion: String(input.promptVersion ?? "phase1-v1"),
      });
      return;
    case "launch":
      {
        const requestedProvider = String(input.provider ?? "resend");
        if (!isOutboundProviderEnabled(requestedProvider)) {
          await failOutboundJob(jobId, `Provider '${requestedProvider}' is disabled`);
          return;
        }
      await runLaunchJob(owner, jobId, {
        campaignId: Number(input.campaignId ?? 0),
        leadIds: Array.isArray(input.leadIds) ? input.leadIds.map((value) => Number(value)).filter(Number.isFinite) : [],
        provider: (requestedProvider as "resend" | "instantly" | "smartlead"),
        dailyCap: Number(input.dailyCap ?? 100),
      });
      return;
      }
    default:
      await failOutboundJob(jobId, `Unknown job stage: ${job.stage}`);
      return;
  }
}
