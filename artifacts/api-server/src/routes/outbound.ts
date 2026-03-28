import { Router, type IRouter, type Request } from "express";
import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { z } from "zod";
import {
  agentLogsTable,
  analyticsEventsTable,
  campaignLeadsTable,
  campaignsTable,
  db,
  domainPoolStateTable,
  leadEnrichmentAttemptsTable,
  leadScoresTable,
  leadSourcesTable,
  leadVerificationResultsTable,
  leadsTable,
  outboundJobAttemptsTable,
  outboundJobsTable,
  outboundMessagesTable,
  sendingEventsTable,
} from "@workspace/db";
import { requireOrgRole } from "../middlewares/requireRole";
import { requireIdempotencyKey } from "../middlewares/requireIdempotencyKey";
import { outboundMcpTools } from "../lib/outboundIntegrations";
import { outboundPhaseOneConfig } from "../lib/outboundConfig";

const router: IRouter = Router();

const importBodySchema = z.object({
  source: z.string().min(1),
  importType: z.enum(["api", "export", "manual"]).default("manual"),
  leads: z.array(z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    company: z.string().min(1),
    title: z.string().min(1),
    industry: z.string().optional(),
    companySize: z.string().optional(),
    linkedinUrl: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  campaignId: z.number().int().positive().optional(),
});

const leadIdsSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1),
  provider: z.string().min(1).optional(),
  campaignId: z.number().int().positive().optional(),
});

const personalizeBodySchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1),
  campaignId: z.number().int().positive(),
  provider: z.string().min(1).default("openai"),
  promptVersion: z.string().default("phase1-v1"),
});

const launchBodySchema = z.object({
  campaignId: z.number().int().positive(),
  leadIds: z.array(z.number().int().positive()).min(1),
  provider: z.enum(["instantly", "smartlead", "resend"]).default("resend"),
  dailyCap: z.number().int().positive().max(1000).default(100),
});

function ownerFilter(req: Request) {
  return req.orgId ? eq(leadsTable.orgId, req.orgId) : eq(leadsTable.userId, req.user!.id);
}

function campaignOwnerFilter(req: Request) {
  return req.orgId ? eq(campaignsTable.orgId, req.orgId) : eq(campaignsTable.userId, req.user!.id);
}

async function createJob(
  req: Request,
  stage: string,
  payload: Record<string, unknown>,
): Promise<typeof outboundJobsTable.$inferSelect> {
  const idempotencyKey = req.header("Idempotency-Key") ?? null;
  if (idempotencyKey) {
    const duplicateFilter = and(
      eq(outboundJobsTable.stage, stage),
      eq(outboundJobsTable.idempotencyKey, idempotencyKey),
      req.orgId ? eq(outboundJobsTable.orgId, req.orgId) : eq(outboundJobsTable.userId, req.user!.id),
    );
    const [existing] = await db.select().from(outboundJobsTable).where(duplicateFilter).orderBy(desc(outboundJobsTable.id));
    if (existing) return existing;
  }

  const [created] = await db
    .insert(outboundJobsTable)
    .values({
      stage,
      status: "processing",
      input: payload,
      idempotencyKey: idempotencyKey ?? undefined,
      userId: req.user!.id,
      orgId: req.orgId,
      campaignId: typeof payload.campaignId === "number" ? payload.campaignId : undefined,
    })
    .returning();

  return created;
}

async function completeJob(jobId: number, result: Record<string, unknown>): Promise<void> {
  await db
    .update(outboundJobsTable)
    .set({ status: "completed", result, error: null, updatedAt: new Date() })
    .where(eq(outboundJobsTable.id, jobId));
}

async function failJob(jobId: number, error: string): Promise<void> {
  await db
    .update(outboundJobsTable)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(eq(outboundJobsTable.id, jobId));
}

router.post(
  "/outbound/jobs/import",
  requireOrgRole(["owner", "admin"]),
  requireIdempotencyKey,
  async (req, res): Promise<void> => {
    const parsed = importBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const payload = parsed.data;
    const job = await createJob(req, "import", payload as unknown as Record<string, unknown>);

    try {
      const importedFromProvider = await outboundMcpTools.sourceImport(payload.source, payload as unknown as Record<string, unknown>);
      const incomingLeads = payload.leads ?? importedFromProvider;

      let imported = 0;
      let duplicates = 0;

      for (const candidate of incomingLeads) {
        const lead = candidate as Record<string, unknown>;
        if (!lead.email || typeof lead.email !== "string") continue;

        const [existing] = await db
          .select()
          .from(leadsTable)
          .where(
            and(
              eq(leadsTable.email, lead.email),
              ownerFilter(req),
            ),
          );

        if (existing) {
          duplicates += 1;
          continue;
        }

        await db.insert(leadsTable).values({
          firstName: String(lead.firstName ?? "Unknown"),
          lastName: String(lead.lastName ?? "Unknown"),
          email: lead.email,
          company: String(lead.company ?? "Unknown"),
          title: String(lead.title ?? "Unknown"),
          source: payload.source,
          status: "sourced",
          industry: typeof lead.industry === "string" ? lead.industry : null,
          companySize: typeof lead.companySize === "string" ? lead.companySize : null,
          linkedinUrl: typeof lead.linkedinUrl === "string" ? lead.linkedinUrl : null,
          notes: typeof lead.notes === "string" ? lead.notes : null,
          userId: req.user!.id,
          orgId: req.orgId,
        });
        imported += 1;
      }

      await db.insert(leadSourcesTable).values({
        source: payload.source,
        importType: payload.importType,
        metadata: payload.filters ?? {},
        importedCount: imported,
        duplicateCount: duplicates,
        userId: req.user!.id,
        orgId: req.orgId,
      });

      await completeJob(job.id, { imported, duplicates, total: imported + duplicates });
      res.status(201).json({ jobId: job.id, imported, duplicates, total: imported + duplicates });
    } catch (error) {
      await failJob(job.id, error instanceof Error ? error.message : "Unknown import error");
      res.status(500).json({ error: "Failed to run import job" });
    }
  },
);

router.post(
  "/outbound/jobs/enrich",
  requireOrgRole(["owner", "admin"]),
  requireIdempotencyKey,
  async (req, res): Promise<void> => {
    const parsed = leadIdsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const provider = parsed.data.provider ?? "clay";
    const job = await createJob(req, "enrich", { ...parsed.data, provider });

    try {
      const leadFilter = and(ownerFilter(req), inArray(leadsTable.id, parsed.data.leadIds));
      const leads = await db.select().from(leadsTable).where(leadFilter);
      const enrichedLeadIds: number[] = [];

      for (const lead of leads) {
        const startedAt = Date.now();
        try {
          const enriched = await outboundMcpTools.enrich(provider, {
            email: lead.email,
            company: lead.company,
            title: lead.title,
          });

          await db.insert(leadEnrichmentAttemptsTable).values({
            leadId: lead.id,
            provider,
            status: "success",
            response: enriched,
            latencyMs: Date.now() - startedAt,
          });

          await db
            .update(leadsTable)
            .set({
              industry: enriched.industry ?? lead.industry,
              companySize: enriched.companySize ?? lead.companySize,
              linkedinUrl: enriched.linkedinUrl ?? lead.linkedinUrl,
              status: "enriched",
              notes: enriched.recentNews ? `${lead.notes ?? ""}\nNews: ${enriched.recentNews}`.trim() : lead.notes,
            })
            .where(eq(leadsTable.id, lead.id));
          enrichedLeadIds.push(lead.id);
        } catch (error) {
          await db.insert(leadEnrichmentAttemptsTable).values({
            leadId: lead.id,
            provider,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown enrichment failure",
            latencyMs: Date.now() - startedAt,
          });
        }
      }

      await completeJob(job.id, { enriched: enrichedLeadIds.length, total: parsed.data.leadIds.length });
      res.json({ jobId: job.id, enriched: enrichedLeadIds.length, total: parsed.data.leadIds.length });
    } catch (error) {
      await failJob(job.id, error instanceof Error ? error.message : "Unknown enrich error");
      res.status(500).json({ error: "Failed to run enrich job" });
    }
  },
);

router.post(
  "/outbound/jobs/verify",
  requireOrgRole(["owner", "admin"]),
  requireIdempotencyKey,
  async (req, res): Promise<void> => {
    const parsed = leadIdsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const provider = parsed.data.provider ?? "millionverifier";
    const job = await createJob(req, "verify", { ...parsed.data, provider });

    try {
      const leadFilter = and(ownerFilter(req), inArray(leadsTable.id, parsed.data.leadIds));
      const leads = await db.select().from(leadsTable).where(leadFilter);
      let verified = 0;
      let invalid = 0;

      for (const lead of leads) {
        const result = await outboundMcpTools.verify(provider, lead.email);
        const finalStatus = result.result === "valid" ? "verified" : result.result === "invalid" ? "invalid" : "review";

        await db.insert(leadVerificationResultsTable).values({
          leadId: lead.id,
          provider,
          result: result.result,
          reason: result.reason,
          raw: result,
        });

        await db
          .update(leadsTable)
          .set({ verified: result.result === "valid", status: finalStatus })
          .where(eq(leadsTable.id, lead.id));

        if (result.result === "valid") verified += 1;
        if (result.result === "invalid") invalid += 1;
      }

      await completeJob(job.id, { verified, invalid, total: parsed.data.leadIds.length });
      res.json({ jobId: job.id, verified, invalid, total: parsed.data.leadIds.length });
    } catch (error) {
      await failJob(job.id, error instanceof Error ? error.message : "Unknown verify error");
      res.status(500).json({ error: "Failed to run verify job" });
    }
  },
);

router.post(
  "/outbound/jobs/personalize",
  requireOrgRole(["owner", "admin"]),
  requireIdempotencyKey,
  async (req, res): Promise<void> => {
    const parsed = personalizeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const job = await createJob(req, "personalize", parsed.data as unknown as Record<string, unknown>);

    try {
      const leads = await db
        .select()
        .from(leadsTable)
        .where(and(ownerFilter(req), inArray(leadsTable.id, parsed.data.leadIds)));

      let generated = 0;
      for (const lead of leads) {
        const heuristicScore = Math.min(
          100,
          20 + (lead.verified ? 30 : 0) + (lead.industry ? 15 : 0) + (lead.companySize ? 10 : 0) + (lead.linkedinUrl ? 10 : 0),
        );
        const bucket = heuristicScore >= 75 ? "hot" : heuristicScore >= 45 ? "warm" : "cold";

        await db.insert(leadScoresTable).values({
          leadId: lead.id,
          score: heuristicScore,
          bucket,
          reasons: {
            verified: lead.verified,
            hasIndustry: !!lead.industry,
            hasCompanySize: !!lead.companySize,
            hasLinkedin: !!lead.linkedinUrl,
          },
          model: `heuristic-${parsed.data.provider}`,
        });

        const subject = `Quick idea for ${lead.company}'s ${lead.title} team`;
        const body = [
          `Hi ${lead.firstName},`,
          "",
          `I noticed ${lead.company} is growing in ${lead.industry ?? "your space"}.`,
          "We help teams improve outbound conversion without adding SDR overhead.",
          "Would you be open to a 15-minute chat next week?",
        ].join("\n");

        await db.insert(outboundMessagesTable).values({
          campaignId: parsed.data.campaignId,
          leadId: lead.id,
          provider: "langchain",
          messageType: "email",
          subject,
          body,
          promptVersion: parsed.data.promptVersion,
          status: "ready",
        });
        generated += 1;
      }

      await completeJob(job.id, { generated, total: parsed.data.leadIds.length });
      res.json({ jobId: job.id, generated, total: parsed.data.leadIds.length });
    } catch (error) {
      await failJob(job.id, error instanceof Error ? error.message : "Unknown personalize error");
      res.status(500).json({ error: "Failed to run personalization job" });
    }
  },
);

router.post(
  "/outbound/jobs/launch",
  requireOrgRole(["owner", "admin"]),
  requireIdempotencyKey,
  async (req, res): Promise<void> => {
    const parsed = launchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const job = await createJob(req, "launch", parsed.data as unknown as Record<string, unknown>);

    try {
      const [campaign] = await db
        .select()
        .from(campaignsTable)
        .where(and(eq(campaignsTable.id, parsed.data.campaignId), campaignOwnerFilter(req)));
      if (!campaign) {
        await failJob(job.id, "Campaign not found");
        res.status(404).json({ error: "Campaign not found" });
        return;
      }

      const leads = await db
        .select()
        .from(leadsTable)
        .where(and(ownerFilter(req), inArray(leadsTable.id, parsed.data.leadIds)));

      const [bestDomain] = await db
        .select()
        .from(domainPoolStateTable)
        .where(req.orgId ? eq(domainPoolStateTable.orgId, req.orgId) : eq(domainPoolStateTable.userId, req.user!.id))
        .orderBy(desc(domainPoolStateTable.healthScore));

      let sent = 0;
      for (const lead of leads.slice(0, parsed.data.dailyCap)) {
        const [message] = await db
          .select()
          .from(outboundMessagesTable)
          .where(and(eq(outboundMessagesTable.campaignId, parsed.data.campaignId), eq(outboundMessagesTable.leadId, lead.id)))
          .orderBy(desc(outboundMessagesTable.id));

        const finalMessage = message ?? {
          subject: campaign.subject ?? `Quick intro for ${lead.company}`,
          body: `Hi ${lead.firstName}, would love to share an idea for ${lead.company}.`,
        };

        const sendResult = await outboundMcpTools.send(parsed.data.provider, {
          to: lead.email,
          subject: finalMessage.subject,
          body: finalMessage.body,
          fromDomain: bestDomain?.domain ?? null,
        });

        await db.insert(campaignLeadsTable).values({
          campaignId: parsed.data.campaignId,
          leadId: lead.id,
          status: "sent",
        });

        await db.insert(sendingEventsTable).values({
          campaignId: parsed.data.campaignId,
          leadId: lead.id,
          provider: parsed.data.provider,
          eventType: "sent",
          eventId: sendResult.externalMessageId,
          payload: { source: "launch_job" },
        });

        await db
          .update(outboundMessagesTable)
          .set({
            provider: parsed.data.provider,
            status: "sent",
            externalMessageId: sendResult.externalMessageId,
            sentAt: new Date(),
          })
          .where(and(eq(outboundMessagesTable.campaignId, parsed.data.campaignId), eq(outboundMessagesTable.leadId, lead.id)));
        sent += 1;
      }

      await db
        .update(campaignsTable)
        .set({
          status: "active",
          sentCount: campaign.sentCount + sent,
          launchedAt: campaign.launchedAt ?? new Date(),
        })
        .where(eq(campaignsTable.id, campaign.id));

      await db.insert(agentLogsTable).values({
        agentType: "outbound",
        action: "launch_campaign",
        status: "completed",
        details: `Launch job sent ${sent} messages`,
        metadata: { campaignId: campaign.id, provider: parsed.data.provider, sent },
        userId: req.user!.id,
        orgId: req.orgId,
      });

      await completeJob(job.id, { sent, total: leads.length, provider: parsed.data.provider });
      res.json({ jobId: job.id, sent, total: leads.length, provider: parsed.data.provider });
    } catch (error) {
      await failJob(job.id, error instanceof Error ? error.message : "Unknown launch error");
      res.status(500).json({ error: "Failed to run launch job" });
    }
  },
);

router.post(
  "/outbound/jobs/:id/retry",
  requireOrgRole(["owner", "admin"]),
  requireIdempotencyKey,
  async (req, res): Promise<void> => {
    const jobId = Number(req.params.id);
    if (!Number.isFinite(jobId)) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }

    const [job] = await db
      .select()
      .from(outboundJobsTable)
      .where(and(eq(outboundJobsTable.id, jobId), req.orgId ? eq(outboundJobsTable.orgId, req.orgId) : eq(outboundJobsTable.userId, req.user!.id)));
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const [attemptRow] = await db
      .select({
        attempts: sql<number>`count(*)::int`,
      })
      .from(outboundJobAttemptsTable)
      .where(eq(outboundJobAttemptsTable.jobId, jobId));

    const nextAttempt = (attemptRow?.attempts ?? 0) + 1;
    await db.insert(outboundJobAttemptsTable).values({
      jobId,
      attempt: nextAttempt,
      status: "completed",
      metadata: { triggeredBy: req.user!.id },
    });

    await db.update(outboundJobsTable).set({
      status: "completed",
      error: null,
      result: { retried: true, attempt: nextAttempt },
      updatedAt: new Date(),
    }).where(eq(outboundJobsTable.id, jobId));

    res.json({ jobId, retried: true, attempt: nextAttempt });
  },
);

router.get("/outbound/jobs/:id", async (req, res): Promise<void> => {
  const jobId = Number(req.params.id);
  if (!Number.isFinite(jobId)) {
    res.status(400).json({ error: "Invalid job id" });
    return;
  }

  const [job] = await db
    .select()
    .from(outboundJobsTable)
    .where(and(eq(outboundJobsTable.id, jobId), req.orgId ? eq(outboundJobsTable.orgId, req.orgId) : eq(outboundJobsTable.userId, req.user!.id)));

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

router.get("/outbound/leads/pipeline", async (req, res): Promise<void> => {
  const [counts] = await db
    .select({
      sourced: sql<number>`coalesce(sum(case when ${leadsTable.status} = 'sourced' then 1 else 0 end), 0)::int`,
      enriched: sql<number>`coalesce(sum(case when ${leadsTable.status} = 'enriched' then 1 else 0 end), 0)::int`,
      verified: sql<number>`coalesce(sum(case when ${leadsTable.status} = 'verified' then 1 else 0 end), 0)::int`,
      invalid: sql<number>`coalesce(sum(case when ${leadsTable.status} = 'invalid' then 1 else 0 end), 0)::int`,
      review: sql<number>`coalesce(sum(case when ${leadsTable.status} = 'review' then 1 else 0 end), 0)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(leadsTable)
    .where(ownerFilter(req));

  res.json({
    sourced: counts?.sourced ?? 0,
    enriched: counts?.enriched ?? 0,
    verified: counts?.verified ?? 0,
    invalid: counts?.invalid ?? 0,
    review: counts?.review ?? 0,
    total: counts?.total ?? 0,
  });
});

router.get("/outbound/config", async (_req, res): Promise<void> => {
  res.json(outboundPhaseOneConfig);
});

router.get("/outbound/campaigns/:id/performance", async (req, res): Promise<void> => {
  const campaignId = Number(req.params.id);
  if (!Number.isFinite(campaignId)) {
    res.status(400).json({ error: "Invalid campaign id" });
    return;
  }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, campaignId), campaignOwnerFilter(req)));

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const [eventCounts] = await db
    .select({
      sent: sql<number>`coalesce(sum(case when ${sendingEventsTable.eventType} = 'sent' then 1 else 0 end), 0)::int`,
      opened: sql<number>`coalesce(sum(case when ${sendingEventsTable.eventType} = 'open' then 1 else 0 end), 0)::int`,
      replied: sql<number>`coalesce(sum(case when ${sendingEventsTable.eventType} = 'reply' then 1 else 0 end), 0)::int`,
      positiveReplies: sql<number>`coalesce(sum(case when ${sendingEventsTable.eventType} = 'positive_reply' then 1 else 0 end), 0)::int`,
      bounces: sql<number>`coalesce(sum(case when ${sendingEventsTable.eventType} = 'bounce' then 1 else 0 end), 0)::int`,
      meetingsBooked: sql<number>`coalesce(sum(case when ${sendingEventsTable.eventType} = 'meeting_booked' then 1 else 0 end), 0)::int`,
    })
    .from(sendingEventsTable)
    .where(eq(sendingEventsTable.campaignId, campaignId));

  const sent = eventCounts?.sent ?? campaign.sentCount;
  const opened = eventCounts?.opened ?? campaign.openCount;
  const replied = eventCounts?.replied ?? campaign.replyCount;
  const positiveReplies = eventCounts?.positiveReplies ?? 0;
  const meetingsBooked = eventCounts?.meetingsBooked ?? campaign.meetingsBooked;
  const bounces = eventCounts?.bounces ?? 0;

  const pct = (numerator: number, denominator: number) => denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;

  await db.insert(analyticsEventsTable).values({
    userId: req.user!.id,
    orgId: req.orgId,
    eventType: "outbound_performance_read",
    entityType: "campaign",
    entityId: campaignId,
    metadata: { sent, opened, replied },
  });

  res.json({
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
  });
});

router.post(
  "/outbound/pilot/run",
  requireOrgRole(["owner", "admin"]),
  requireIdempotencyKey,
  async (req, res): Promise<void> => {
    const campaignId = typeof req.body?.campaignId === "number" ? req.body.campaignId : null;
    if (!campaignId) {
      res.status(400).json({ error: "campaignId is required" });
      return;
    }

    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(and(eq(campaignsTable.id, campaignId), campaignOwnerFilter(req)));
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const [eventCounts] = await db
      .select({
        sent: sql<number>`coalesce(sum(case when ${sendingEventsTable.eventType} = 'sent' then 1 else 0 end), 0)::int`,
        opened: sql<number>`coalesce(sum(case when ${sendingEventsTable.eventType} = 'open' then 1 else 0 end), 0)::int`,
        replied: sql<number>`coalesce(sum(case when ${sendingEventsTable.eventType} = 'reply' then 1 else 0 end), 0)::int`,
        positiveReplies: sql<number>`coalesce(sum(case when ${sendingEventsTable.eventType} = 'positive_reply' then 1 else 0 end), 0)::int`,
      })
      .from(sendingEventsTable)
      .where(eq(sendingEventsTable.campaignId, campaignId));

    const sent = eventCounts?.sent ?? campaign.sentCount;
    const opened = eventCounts?.opened ?? campaign.openCount;
    const replied = eventCounts?.replied ?? campaign.replyCount;
    const positiveReplies = eventCounts?.positiveReplies ?? 0;

    const pct = (numerator: number, denominator: number) => denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;
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

    await db.insert(analyticsEventsTable).values({
      userId: req.user!.id,
      orgId: req.orgId,
      eventType: "outbound_pilot_run",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { metrics, checks, targets },
    });

    res.json({
      campaignId,
      metrics,
      targets,
      checks,
      passed: checks.openRate && checks.replyRate && checks.positiveReplyRate,
    });
  },
);

export default router;
