import {
  agentLogsTable,
  analyticsEventsTable,
  campaignLeadsTable,
  campaignsTable,
  db,
  domainPoolStateTable,
  emailRepliesTable,
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
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { OwnerContext } from "../security/ownerContext";
import { ownerScope } from "../security/ownerContext";

export function getOwnedLeadFilter(owner: OwnerContext): SQL<unknown> {
  return ownerScope(leadsTable, owner);
}

export function getOwnedCampaignFilter(owner: OwnerContext): SQL<unknown> {
  return ownerScope(campaignsTable, owner);
}

export async function findExistingJobByIdempotency(stage: string, idempotencyKey: string, owner: OwnerContext) {
  const [existing] = await db
    .select()
    .from(outboundJobsTable)
    .where(
      and(
        eq(outboundJobsTable.stage, stage),
        eq(outboundJobsTable.idempotencyKey, idempotencyKey),
        ownerScope(outboundJobsTable, owner),
      ),
    )
    .orderBy(desc(outboundJobsTable.id));
  return existing;
}

export async function createOutboundJob(
  stage: string,
  payload: Record<string, unknown>,
  owner: OwnerContext,
  idempotencyKey: string | null,
) {
  const [created] = await db
    .insert(outboundJobsTable)
    .values({
      stage,
      status: "queued",
      input: payload,
      idempotencyKey: idempotencyKey ?? undefined,
      userId: owner.userId,
      orgId: owner.orgId,
      campaignId: typeof payload.campaignId === "number" ? payload.campaignId : undefined,
    })
    .returning();
  return created;
}

export async function setOutboundJobStatus(jobId: number, status: string) {
  await db
    .update(outboundJobsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(outboundJobsTable.id, jobId));
}

export async function getJobById(jobId: number) {
  const [job] = await db.select().from(outboundJobsTable).where(eq(outboundJobsTable.id, jobId));
  return job;
}

export async function completeOutboundJob(jobId: number, result: Record<string, unknown>) {
  await db
    .update(outboundJobsTable)
    .set({ status: "completed", result, error: null, updatedAt: new Date() })
    .where(eq(outboundJobsTable.id, jobId));
}

export async function failOutboundJob(jobId: number, error: string) {
  await db
    .update(outboundJobsTable)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(eq(outboundJobsTable.id, jobId));
}

export async function findLeadByEmailOwned(email: string, owner: OwnerContext) {
  const [existing] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.email, email), ownerScope(leadsTable, owner)));
  return existing;
}

export async function createLeadFromImport(
  lead: Record<string, unknown>,
  source: string,
  owner: OwnerContext,
) {
  // Build notes: merge any existing notes string with apolloId / website metadata
  // so the caller can retrieve the Apollo org ID later for organization_top_people
  const metaFields: Record<string, string> = {};
  if (typeof lead.apolloId === "string" && lead.apolloId) metaFields.apolloId = lead.apolloId;
  if (typeof lead.website === "string" && lead.website) metaFields.website = lead.website;
  const existingNotes = typeof lead.notes === "string" ? lead.notes : null;
  const notesValue = Object.keys(metaFields).length > 0
    ? JSON.stringify(metaFields) + (existingNotes ? `\n${existingNotes}` : "")
    : existingNotes;

  // For org-only imports (no email), build a stable placeholder so the NOT NULL constraint is satisfied.
  // Placeholder format: apollo-org-{apolloId}@placeholder.local
  const email = typeof lead.email === "string" && lead.email
    ? lead.email
    : `apollo-org-${lead.apolloId ?? lead.company ?? Date.now()}@placeholder.local`;

  const [inserted] = await db.insert(leadsTable).values({
    firstName: String(lead.firstName ?? ""),
    lastName: String(lead.lastName ?? ""),
    email,
    company: String(lead.company ?? "Unknown"),
    title: String(lead.title ?? ""),
    source,
    status: "sourced",
    industry: typeof lead.industry === "string" ? lead.industry : null,
    companySize: typeof lead.companySize === "string" ? lead.companySize : null,
    linkedinUrl: typeof lead.linkedinUrl === "string" ? lead.linkedinUrl : null,
    notes: notesValue,
    userId: owner.userId,
    orgId: owner.orgId,
  }).returning({ id: leadsTable.id });
  
  return inserted;
}

export async function createLeadSourceRecord(
  source: string,
  importType: string,
  metadata: Record<string, unknown>,
  importedCount: number,
  duplicateCount: number,
  owner: OwnerContext,
) {
  await db.insert(leadSourcesTable).values({
    source,
    importType,
    metadata,
    importedCount,
    duplicateCount,
    userId: owner.userId,
    orgId: owner.orgId,
  });
}

export async function listOwnedLeadsByIds(leadIds: number[], owner: OwnerContext) {
  return db
    .select()
    .from(leadsTable)
    .where(and(ownerScope(leadsTable, owner), inArray(leadsTable.id, leadIds)));
}

export async function createEnrichmentAttempt(
  leadId: number,
  provider: string,
  status: "success" | "failed",
  options: { response?: unknown; error?: string; latencyMs?: number },
) {
  await db.insert(leadEnrichmentAttemptsTable).values({
    leadId,
    provider,
    status,
    response: options.response,
    error: options.error,
    latencyMs: options.latencyMs,
  });
}

export async function markLeadEnriched(
  leadId: number,
  current: {
    industry: string | null;
    companySize: string | null;
    linkedinUrl: string | null;
    notes: string | null;
  },
  enriched: {
    industry?: string;
    companySize?: string;
    linkedinUrl?: string;
    recentNews?: string;
  },
) {
  await db
    .update(leadsTable)
    .set({
      industry: enriched.industry ?? current.industry,
      companySize: enriched.companySize ?? current.companySize,
      linkedinUrl: enriched.linkedinUrl ?? current.linkedinUrl,
      status: "enriched",
      notes: enriched.recentNews ? `${current.notes ?? ""}\nNews: ${enriched.recentNews}`.trim() : current.notes,
    })
    .where(eq(leadsTable.id, leadId));
}

export async function createVerificationResult(
  leadId: number,
  provider: string,
  result: string,
  reason: string,
  raw: unknown,
) {
  await db.insert(leadVerificationResultsTable).values({
    leadId,
    provider,
    result,
    reason,
    raw,
  });
}

export async function updateLeadVerification(leadId: number, isVerified: boolean, status: string) {
  await db
    .update(leadsTable)
    .set({ verified: isVerified, status })
    .where(eq(leadsTable.id, leadId));
}

export async function createLeadScore(
  leadId: number,
  score: number,
  bucket: string,
  reasons: Record<string, unknown>,
  model: string,
) {
  await db.insert(leadScoresTable).values({
    leadId,
    score,
    bucket,
    reasons,
    model,
  });
}

export async function createOutboundMessage(
  campaignId: number,
  leadId: number,
  subject: string,
  body: string,
  promptVersion: string,
) {
  await db.insert(outboundMessagesTable).values({
    campaignId,
    leadId,
    provider: "langchain",
    messageType: "email",
    subject,
    body,
    promptVersion,
    status: "ready",
  });
}

export async function getOwnedCampaignById(campaignId: number, owner: OwnerContext) {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, campaignId), ownerScope(campaignsTable, owner)));
  return campaign;
}

export async function getBestDomainForOwner(owner: OwnerContext) {
  const [bestDomain] = await db
    .select()
    .from(domainPoolStateTable)
    .where(ownerScope(domainPoolStateTable, owner))
    .orderBy(desc(domainPoolStateTable.healthScore));
  return bestDomain;
}

export async function getLatestOutboundMessage(campaignId: number, leadId: number) {
  const [message] = await db
    .select()
    .from(outboundMessagesTable)
    .where(and(eq(outboundMessagesTable.campaignId, campaignId), eq(outboundMessagesTable.leadId, leadId)))
    .orderBy(desc(outboundMessagesTable.id));
  return message;
}

export async function findRecentCampaignForEmail(email: string) {
  const [match] = await db
    .select({
      leadId: leadsTable.id,
      campaignId: outboundMessagesTable.campaignId,
    })
    .from(outboundMessagesTable)
    .innerJoin(leadsTable, eq(outboundMessagesTable.leadId, leadsTable.id))
    .where(eq(leadsTable.email, email))
    .orderBy(desc(outboundMessagesTable.sentAt), desc(outboundMessagesTable.createdAt));
  
  return match ?? null;
}

/**
 * Fallback for TEST_EMAIL_OVERRIDE mode: when all emails are redirected to a
 * single test address, real lead emails won't match the reply sender.  Return
 * the most recently sent outbound message so the reply is still attributed to
 * the correct campaign and lead.
 */
export async function findMostRecentSentMessage() {
  const [match] = await db
    .select({
      leadId: outboundMessagesTable.leadId,
      campaignId: outboundMessagesTable.campaignId,
    })
    .from(outboundMessagesTable)
    .where(sql`status = 'sent'`)
    .orderBy(desc(outboundMessagesTable.sentAt), desc(outboundMessagesTable.createdAt))
    .limit(1);

  return match ?? null;
}

type DbExecutor = {
  insert: typeof db.insert;
  update: typeof db.update;
  select: typeof db.select;
};

export async function markLeadSent(campaignId: number, leadId: number, executor: DbExecutor = db) {
  await executor.insert(campaignLeadsTable).values({
    campaignId,
    leadId,
    status: "sent",
  });
}

export async function createSendingEvent(values: {
  campaignId: number | null;
  leadId: number | null;
  provider: string;
  eventType: string;
  eventId: string;
  payload: unknown;
}, executor: DbExecutor = db) {
  const [row] = await executor.insert(sendingEventsTable).values(values).returning();
  return row;
}

export async function markOutboundMessageSent(
  campaignId: number,
  leadId: number,
  provider: string,
  externalMessageId: string,
  executor: DbExecutor = db,
) {
  await executor
    .update(outboundMessagesTable)
    .set({
      provider,
      status: "sent",
      externalMessageId,
      sentAt: new Date(),
    })
    .where(and(eq(outboundMessagesTable.campaignId, campaignId), eq(outboundMessagesTable.leadId, leadId)));
}

export async function activateCampaign(campaignId: number, sentDelta: number, executor: DbExecutor = db) {
  const [campaign] = await executor.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (!campaign) return;
  await executor
    .update(campaignsTable)
    .set({
      status: "active",
      sentCount: campaign.sentCount + sentDelta,
      launchedAt: campaign.launchedAt ?? new Date(),
    })
    .where(eq(campaignsTable.id, campaignId));
}

export async function createAgentLog(values: {
  agentType: string;
  action: string;
  status: string;
  details: string;
  metadata?: Record<string, unknown>;
  owner: OwnerContext;
  executor?: DbExecutor;
}) {
  const executor = values.executor ?? db;
  await executor.insert(agentLogsTable).values({
    agentType: values.agentType,
    action: values.action,
    status: values.status,
    details: values.details,
    metadata: values.metadata,
    userId: values.owner.userId,
    orgId: values.owner.orgId,
  });
}

export async function getOwnedJobById(jobId: number, owner: OwnerContext) {
  const [job] = await db
    .select()
    .from(outboundJobsTable)
    .where(and(eq(outboundJobsTable.id, jobId), ownerScope(outboundJobsTable, owner)));
  return job;
}

export async function getJobAttemptCount(jobId: number) {
  const [attemptRow] = await db
    .select({ attempts: sql<number>`count(*)::int` })
    .from(outboundJobAttemptsTable)
    .where(eq(outboundJobAttemptsTable.jobId, jobId));
  return attemptRow?.attempts ?? 0;
}

export async function createJobAttempt(jobId: number, attempt: number, triggeredBy: string) {
  await db.insert(outboundJobAttemptsTable).values({
    jobId,
    attempt,
    status: "completed",
    metadata: { triggeredBy },
  });
}

export async function setJobRetryResult(jobId: number, attempt: number) {
  await db
    .update(outboundJobsTable)
    .set({
      status: "queued",
      error: null,
      result: { retried: true, attempt },
      updatedAt: new Date(),
    })
    .where(eq(outboundJobsTable.id, jobId));
}

export async function getLeadPipeline(owner: OwnerContext) {
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
    .where(ownerScope(leadsTable, owner));
  return counts;
}

export async function getCampaignEventCounts(campaignId: number) {
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
  return eventCounts;
}

export async function createAnalyticsEvent(values: {
  userId: string;
  orgId: number | null;
  eventType: string;
  entityType: string;
  entityId?: number | null;
  metadata: Record<string, unknown>;
}, executor: DbExecutor = db) {
  await executor.insert(analyticsEventsTable).values(values);
}

export async function findSendingEvent(provider: string, eventId: string) {
  const [existing] = await db
    .select()
    .from(sendingEventsTable)
    .where(and(eq(sendingEventsTable.provider, provider), eq(sendingEventsTable.eventId, eventId)));
  return existing;
}

export async function createEmailReply(
  values: {
    campaignId?: number | null;
    leadId?: number | null;
    sendingEventId?: number | null;
    provider: string;
    fromEmail?: string | null;
    subject?: string | null;
    textBody?: string | null;
    htmlBody?: string | null;
    /** Resend email_id — used to re-fetch body via GET /emails/receiving/:id */
    resendEmailId?: string | null;
    /** Raw Message-ID header — used as In-Reply-To for reply threading */
    messageId?: string | null;
    sentiment?: string;
  },
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .insert(emailRepliesTable)
    .values({
      campaignId: values.campaignId ?? null,
      leadId: values.leadId ?? null,
      sendingEventId: values.sendingEventId ?? null,
      provider: values.provider,
      fromEmail: values.fromEmail ?? null,
      subject: values.subject ?? null,
      textBody: values.textBody ?? null,
      htmlBody: values.htmlBody ?? null,
      resendEmailId: values.resendEmailId ?? null,
      messageId: values.messageId ?? null,
      sentiment: values.sentiment ?? "unknown",
    })
    .returning();
  return row;
}

export async function listEmailReplies(
  filters: { campaignId?: number; leadId?: number },
  limit = 50,
) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters.campaignId != null) {
    conditions.push(eq(emailRepliesTable.campaignId, filters.campaignId));
  }
  if (filters.leadId != null) {
    conditions.push(eq(emailRepliesTable.leadId, filters.leadId));
  }
  return db
    .select()
    .from(emailRepliesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(emailRepliesTable.receivedAt))
    .limit(limit);
}

export async function applyCampaignEventDelta(campaignId: number, eventType: string, executor: DbExecutor = db) {
  const [campaign] = await executor.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (!campaign) return;
  await executor
    .update(campaignsTable)
    .set({
      openCount: eventType === "open" ? campaign.openCount + 1 : campaign.openCount,
      replyCount: eventType === "reply" ? campaign.replyCount + 1 : campaign.replyCount,
      meetingsBooked: eventType === "meeting_booked" ? campaign.meetingsBooked + 1 : campaign.meetingsBooked,
      sentCount: eventType === "sent" ? campaign.sentCount + 1 : campaign.sentCount,
    })
    .where(eq(campaignsTable.id, campaignId));
}

export { db };
