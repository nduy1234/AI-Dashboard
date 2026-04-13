import type { OwnerContext } from "../security/ownerContext";
import { launchInstantlyCampaign, outboundMcpTools } from "../lib/outboundIntegrations";
import { isOutboundProviderEnabled, outboundPhaseOneConfig } from "../lib/outboundConfig";
import { notifyCampaignLaunched } from "../lib/slackClient";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generatePersonalizedEmail, isGroqAvailable } from "../lib/groqClient";
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
    apolloSearchType?: string;
    leads?: Array<Record<string, unknown>>;
    filters?: Record<string, unknown>;
    page?: number;
    perPage?: number;
  },
  skipJobCompletion?: boolean,
) {
  try {
    const searchType = payload.apolloSearchType ?? "default";
    console.log(`\x1b[36m[import #${jobId}]\x1b[0m source=${payload.source} type=${searchType} filters=${JSON.stringify(payload.filters ?? {})}`);

    const importedFromProvider = await outboundMcpTools.sourceImport(payload.source, payload);
    const incomingLeads = payload.leads ?? importedFromProvider;

    console.log(`\x1b[36m[import #${jobId}]\x1b[0m provider returned ${incomingLeads.length} record(s)`);

    let imported = 0;
    let duplicates = 0;
    const newLeadIds: number[] = [];

    for (const lead of incomingLeads) {
      // org-level imports (organization_search) have no email — allow them through,
      // createLeadFromImport will assign a placeholder email so the NOT NULL is satisfied.
      const isOrgImport = payload.apolloSearchType === "organization_search"
        || payload.apolloSearchType === "organization_enrich";
      const hasEmail = typeof lead.email === "string" && lead.email !== "";
      if (!hasEmail && !isOrgImport) continue;

      // Deduplicate by email (skip placeholder comparison for org imports)
      if (hasEmail) {
        const existing = await findLeadByEmailOwned(lead.email as string, owner);
        if (existing) {
          console.log(`\x1b[33m[import #${jobId}]\x1b[0m duplicate skipped: ${lead.email as string}`);
          duplicates += 1;
          continue;
        }
      }

      const inserted = await createLeadFromImport(lead, payload.source, owner);
      if (inserted) {
        newLeadIds.push(inserted.id);
        console.log(`\x1b[32m[import #${jobId}]\x1b[0m inserted lead id=${inserted.id} | ${String(lead.firstName ?? "")} ${String(lead.lastName ?? "")} | ${String(lead.email ?? lead.company ?? "")}`);
      }
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
    const result = { imported, duplicates, total: imported + duplicates, newLeadIds };
    console.log(`\x1b[32m[import #${jobId}]\x1b[0m done — imported=${imported} duplicates=${duplicates} ids=[${newLeadIds.join(",")}]`);
    if (!skipJobCompletion) await completeOutboundJob(jobId, result);
    return result;
  } catch (error) {
    if (!skipJobCompletion) await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown import error");
    throw error;
  }
}

export async function runEnrichJob(
  owner: OwnerContext,
  jobId: number,
  payload: { leadIds: number[]; provider: string },
  skipJobCompletion?: boolean,
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
    if (!skipJobCompletion) await completeOutboundJob(jobId, result);
    return result;
  } catch (error) {
    if (!skipJobCompletion) await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown enrich error");
    throw error;
  }
}

export async function runVerifyJob(
  owner: OwnerContext,
  jobId: number,
  payload: { leadIds: number[]; provider: string },
  skipJobCompletion?: boolean,
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
    if (!skipJobCompletion) await completeOutboundJob(jobId, response);
    return response;
  } catch (error) {
    if (!skipJobCompletion) await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown verify error");
    throw error;
  }
}

export async function runPersonalizeJob(
  owner: OwnerContext,
  jobId: number,
  payload: { leadIds: number[]; campaignId: number; provider: string; promptVersion: string },
  skipJobCompletion?: boolean,
) {
  try {
    const leads = await listOwnedLeadsByIds(payload.leadIds, owner);
    let generated = 0;

    for (const lead of leads) {
      // Heuristic lead score
      const heuristicScore = Math.min(
        100,
        20 + (lead.verified ? 30 : 0) + (lead.industry ? 15 : 0) + (lead.companySize ? 10 : 0) + (lead.linkedinUrl ? 10 : 0),
      );
      const bucket = heuristicScore >= 75 ? "hot" : heuristicScore >= 45 ? "warm" : "cold";
      await createLeadScore(
        lead.id,
        heuristicScore,
        bucket,
        { verified: lead.verified, hasIndustry: !!lead.industry, hasCompanySize: !!lead.companySize, hasLinkedin: !!lead.linkedinUrl },
        `heuristic-${payload.provider}`,
      );

      let subject: string;
      let body: string;

      const leadCtx = `id=${lead.id} (${lead.firstName} ${lead.lastName} @ ${lead.company})`;
      const useOpenAI = payload.provider === "openai" && !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const useGroq = payload.provider === "groq" && isGroqAvailable();
      const bookingUrl = process.env.CALCOM_BOOKING_URL?.trim() || null;

      const heuristicBody = (firstName: string, company: string, industry: string | null | undefined, url: string | null) => [
        `Hi ${firstName},`,
        "",
        `I noticed ${company} is making moves in ${industry ?? "your space"} and wanted to reach out directly.`,
        "We help B2B teams improve outbound conversion without adding SDR headcount — typically within the first 30 days.",
        url
          ? `I'd love to show you what that looks like for ${company}. Book a quick 15-minute call here: ${url}`
          : `Would you be open to a quick 15-minute call to explore if there's a fit?`,
        "",
        "Best regards,",
      ].join("\n");

      if (useGroq) {
        console.log(`\x1b[36m[personalize #${jobId}]\x1b[0m calling Groq (llama-3.3-70b) for lead ${leadCtx}`);
        try {
          const result = await generatePersonalizedEmail({
            firstName: lead.firstName,
            lastName: lead.lastName,
            title: lead.title,
            company: lead.company,
            industry: lead.industry,
            companySize: lead.companySize,
            linkedinUrl: lead.linkedinUrl,
            bookingUrl,
          });
          subject = result.subject;
          body = result.body;
          console.log(`\x1b[32m[personalize #${jobId}]\x1b[0m Groq generated for ${lead.firstName}:\n  Subject: ${subject}\n  Body: ${body.slice(0, 150)}...`);
        } catch (err) {
          console.error(`\x1b[31m[personalize #${jobId}]\x1b[0m Groq failed for lead ${lead.id}: ${(err as Error).message}`);
          subject = `Quick idea for ${lead.company}'s ${lead.title} team`;
          body = heuristicBody(lead.firstName, lead.company, lead.industry, bookingUrl);
        }
      } else if (useOpenAI) {
        console.log(`\x1b[36m[personalize #${jobId}]\x1b[0m calling OpenAI (gpt-4o) for lead ${leadCtx}`);
        try {
          const ctaLine = bookingUrl
            ? `end with a CTA to book a 15-minute call using this exact link: ${bookingUrl}`
            : `end with a CTA offering a 15-minute call`;
          const prompt = `You are an expert B2B cold email copywriter. Write a short, formal, personalized cold email.
Lead info:
- Name: ${lead.firstName} ${lead.lastName}
- Title: ${lead.title}
- Company: ${lead.company}
- Industry: ${lead.industry ?? "Unknown"}
- Company size: ${lead.companySize ?? "Unknown"}
Requirements:
- Subject: under 10 words, curiosity-driven
- Body: formal but approachable, 3-4 sentences max
- MUST open with "Hi ${lead.firstName}," or "Hello ${lead.firstName}," on its own line
- One specific observation about ${lead.company} or their role
- One value proposition relevant to their industry
- ${ctaLine}
- Close with "Best regards," on its own line
- Do NOT use filler openers like "I hope this finds you well"
Respond with ONLY valid JSON: { "subject": "...", "body": "..." }`;
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            max_completion_tokens: 512,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          });
          const raw = completion.choices[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(raw) as { subject?: string; body?: string };
          subject = parsed.subject ?? `Quick idea for ${lead.company}`;
          body = parsed.body ?? "";
          console.log(`\x1b[32m[personalize #${jobId}]\x1b[0m OpenAI generated for ${lead.firstName}:\n  Subject: ${subject}\n  Body: ${body.slice(0, 150)}...`);
        } catch (err) {
          console.error(`\x1b[31m[personalize #${jobId}]\x1b[0m OpenAI failed for lead ${lead.id}, trying Groq fallback: ${(err as Error).message}`);
          if (isGroqAvailable()) {
            const result = await generatePersonalizedEmail({ firstName: lead.firstName, lastName: lead.lastName, title: lead.title, company: lead.company, industry: lead.industry, companySize: lead.companySize, linkedinUrl: lead.linkedinUrl, bookingUrl });
            subject = result.subject;
            body = result.body;
            console.log(`\x1b[32m[personalize #${jobId}]\x1b[0m Groq fallback succeeded for ${lead.firstName}: ${subject}`);
          } else {
            subject = `Quick idea for ${lead.company}'s ${lead.title} team`;
            body = heuristicBody(lead.firstName, lead.company, lead.industry, bookingUrl);
          }
        }
      } else {
        console.log(`\x1b[33m[personalize #${jobId}]\x1b[0m heuristic fallback for lead ${leadCtx} (provider=${payload.provider})`);
        subject = `Quick idea for ${lead.company}'s ${lead.title} team`;
        body = heuristicBody(lead.firstName, lead.company, lead.industry, bookingUrl);
      }

      // Safety net: if AI generated a body but didn't include the booking link, append it
      if (bookingUrl && !body.includes(bookingUrl)) {
        body = `${body}\n\nBook a time here: ${bookingUrl}`;
      }

      await createOutboundMessage(payload.campaignId, lead.id, subject, body, payload.promptVersion);
      generated += 1;
    }

    const response = { generated, total: payload.leadIds.length };
    if (!skipJobCompletion) await completeOutboundJob(jobId, response);
    return response;
  } catch (error) {
    if (!skipJobCompletion) await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown personalize error");
    throw error;
  }
}

export async function runLaunchJob(
  owner: OwnerContext,
  jobId: number,
  payload: { campaignId: number; leadIds: number[]; provider: "instantly" | "smartlead" | "resend"; dailyCap: number },
  skipJobCompletion?: boolean,
) {
  try {
    const bookingUrl = process.env.CALCOM_BOOKING_URL?.trim() || null;
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
        const fallbackBody = firstMessage?.body
          ?? (bookingUrl
            ? `Hi, sharing a quick idea for your growth goals. Book a quick 15-minute call here: ${bookingUrl}`
            : "Hi, sharing a quick idea for your growth goals.");
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
          body: bookingUrl
            ? `Hi ${lead.firstName}, would love to share an idea for ${lead.company}. Book a quick 15-minute call here: ${bookingUrl}`
            : `Hi ${lead.firstName}, would love to share an idea for ${lead.company}.`,
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
    if (!skipJobCompletion) await completeOutboundJob(jobId, response);
    return response;
  } catch (error) {
    if (!skipJobCompletion) await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown launch error");
    throw error;
  }
}

export async function runAllPipelineJob(
  owner: OwnerContext,
  jobId: number,
  payload: {
    source: string;
    filters?: Record<string, unknown>;
    campaignId: number;
    enrichProvider?: string;
    verifyProvider?: string;
    personalizeProvider?: string;
    launchProvider?: "resend" | "instantly" | "smartlead";
    dailyCap?: number;
  }
) {
  try {
    const importRes = await runImportJob(owner, jobId, { source: payload.source, importType: "api", filters: payload.filters }, true);
    if (!importRes.newLeadIds || importRes.newLeadIds.length === 0) {
      await completeOutboundJob(jobId, { status: "completed", message: "No new leads imported", ...importRes });
      return importRes;
    }
    const leadIds = importRes.newLeadIds;

    const enrichProvider = payload.enrichProvider || "clay";
    await runEnrichJob(owner, jobId, { leadIds, provider: enrichProvider }, true);

    const verifyProvider = payload.verifyProvider || "millionverifier";
    await runVerifyJob(owner, jobId, { leadIds, provider: verifyProvider }, true);

    const personalizeProvider = payload.personalizeProvider || "openai";
    await runPersonalizeJob(owner, jobId, { leadIds, campaignId: payload.campaignId, provider: personalizeProvider, promptVersion: "phase1-v1" }, true);

    const launchProvider = payload.launchProvider || "resend";
    const launchRes = await runLaunchJob(owner, jobId, { leadIds, campaignId: payload.campaignId, provider: launchProvider, dailyCap: payload.dailyCap || 100 }, true);

    const finalResult = {
      imported: importRes.imported,
      launched: launchRes?.sent,
      status: "full_pipeline_completed"
    };

    await completeOutboundJob(jobId, finalResult);
    return finalResult;
  } catch (error) {
    await failOutboundJob(jobId, error instanceof Error ? error.message : "Unknown run-all error");
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
        apolloSearchType: typeof input.apolloSearchType === "string" ? input.apolloSearchType : undefined,
        leads: Array.isArray(input.leads) ? (input.leads as Array<Record<string, unknown>>) : undefined,
        filters: typeof input.filters === "object" && input.filters ? (input.filters as Record<string, unknown>) : undefined,
        page: typeof input.page === "number" ? input.page : undefined,
        perPage: typeof input.perPage === "number" ? input.perPage : undefined,
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
    case "run_all_pipeline":
      await runAllPipelineJob(owner, jobId, {
        source: String(input.source ?? "apollo"),
        filters: typeof input.filters === "object" ? (input.filters as Record<string, unknown>) : undefined,
        campaignId: Number(input.campaignId ?? 0),
        enrichProvider: typeof input.enrichProvider === "string" ? input.enrichProvider : undefined,
        verifyProvider: typeof input.verifyProvider === "string" ? input.verifyProvider : undefined,
        personalizeProvider: typeof input.personalizeProvider === "string" ? input.personalizeProvider : undefined,
        launchProvider: typeof input.launchProvider === "string" ? (input.launchProvider as any) : undefined,
        dailyCap: typeof input.dailyCap === "number" ? input.dailyCap : 100,
      });
      return;
    default:
      await failOutboundJob(jobId, `Unknown job stage: ${job.stage}`);
      return;
  }
}
