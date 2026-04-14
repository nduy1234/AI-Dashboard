/**
 * Reactivation Service
 *
 * Owns three responsibilities:
 *  1. scanEmitter   — EventEmitter for real-time SSE progress per scan job
 *  2. Scan queue    — BullMQ queue/worker that runs the HubSpot import pipeline
 *  3. Sequence queue — BullMQ queue/worker for per-step email dispatch with delays
 */

import { EventEmitter } from "node:events";
import { Queue, Worker } from "bullmq";
import { eq, inArray, and, desc } from "drizzle-orm";
import {
  db,
  leadsTable,
  integrationsTable,
  reactivationScanJobsTable,
  campaignSequenceStepsTable,
  outboundMessagesTable,
  agentLogsTable,
} from "@workspace/db";
import { fetchDormantDeals, type ScanFilters } from "../lib/hubspotClient";
import {
  createSendingEvent,
  markLeadSent,
  markOutboundMessageSent,
  applyCampaignEventDelta,
} from "../repositories/outboundRepository";
import { sendEmail } from "../lib/email";

// ── SSE Emitter ───────────────────────────────────────────────────────────────

export interface ScanProgressEvent {
  jobId: number;
  status: "running" | "completed" | "failed";
  totalFound: number;
  imported: number;
  duplicates: number;
  excluded: number;
  progress: number;
  error?: string;
}

class ScanEmitter extends EventEmitter {
  private readonly last = new Map<number, ScanProgressEvent>();

  emit(event: string, data: ScanProgressEvent): boolean {
    this.last.set(data.jobId, data);
    return super.emit(event, data);
  }

  emitProgress(data: ScanProgressEvent): void {
    this.emit(`scan:${data.jobId}`, data);
  }

  getLastEvent(jobId: number): ScanProgressEvent | undefined {
    return this.last.get(jobId);
  }

  clearJob(jobId: number): void {
    this.last.delete(jobId);
  }
}

export const scanEmitter = new ScanEmitter();
scanEmitter.setMaxListeners(500);

// ── Queue setup ───────────────────────────────────────────────────────────────

const redisUrl = process.env.REDIS_URL;

function makeConnection() {
  if (!redisUrl) return null;
  return { url: redisUrl };
}

// Scan queue: jobId = reactivation_scan_jobs.id
const SCAN_QUEUE = "reactivation-scan";
// Sequence queue: { stepId: campaignSequenceSteps.id }
const SEQ_QUEUE = "reactivation-sequence";

let scanQueue: Queue<{ jobId: number }> | null = null;
let seqQueue: Queue<{ stepId: number }> | null = null;

function getScanQueue(): Queue<{ jobId: number }> | null {
  const conn = makeConnection();
  if (!conn) return null;
  if (!scanQueue) {
    scanQueue = new Queue<{ jobId: number }>(SCAN_QUEUE, { connection: conn });
  }
  return scanQueue;
}

function getSeqQueue(): Queue<{ stepId: number }> | null {
  const conn = makeConnection();
  if (!conn) return null;
  if (!seqQueue) {
    seqQueue = new Queue<{ stepId: number }>(SEQ_QUEUE, { connection: conn });
  }
  return seqQueue;
}

// ── Scan Job Processing ───────────────────────────────────────────────────────

async function processScanJob(scanJobId: number): Promise<void> {
  // Mark running
  await db
    .update(reactivationScanJobsTable)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(reactivationScanJobsTable.id, scanJobId));

  const [scanJob] = await db
    .select()
    .from(reactivationScanJobsTable)
    .where(eq(reactivationScanJobsTable.id, scanJobId));

  if (!scanJob) throw new Error(`Scan job ${scanJobId} not found`);

  const filters = (scanJob.filters ?? {}) as ScanFilters & { userId?: string; orgId?: number };
  const userId = scanJob.userId ?? "system";
  const orgId = scanJob.orgId ?? null;

  // Fetch HubSpot API key from integrations table (scoped to the requesting user)
  const [integration] = await db
    .select()
    .from(integrationsTable)
    .where(
      and(
        eq(integrationsTable.type, "hubspot"),
        eq(integrationsTable.userId, userId),
        eq(integrationsTable.apiKeyConfigured, true),
      ),
    )
    .orderBy(desc(integrationsTable.id))
    .limit(1);

  const config = integration?.config as Record<string, unknown> | null;
  const apiKey = typeof config?.apiKey === "string" ? config.apiKey : null;

  if (!apiKey) {
    const errMsg = "HubSpot API key not configured. Connect HubSpot first.";
    await db
      .update(reactivationScanJobsTable)
      .set({ status: "failed", error: errMsg, completedAt: new Date() })
      .where(eq(reactivationScanJobsTable.id, scanJobId));
    scanEmitter.emitProgress({ jobId: scanJobId, status: "failed", totalFound: 0, imported: 0, duplicates: 0, excluded: 0, progress: 100, error: errMsg });
    throw new Error(errMsg);
  }

  try {
    const scanFilters: ScanFilters = {
      inactivityDays: Number(filters.inactivityDays) || 30,
      dealStage: typeof filters.dealStage === "string" ? filters.dealStage : undefined,
      minDealValue: Number(filters.minDealValue) || 0,
      maxResults: 500,
    };

    // Emit initial progress
    scanEmitter.emitProgress({ jobId: scanJobId, status: "running", totalFound: 0, imported: 0, duplicates: 0, excluded: 0, progress: 5 });

    const deals = await fetchDormantDeals(apiKey, scanFilters);
    const totalFound = deals.length;

    scanEmitter.emitProgress({ jobId: scanJobId, status: "running", totalFound, imported: 0, duplicates: 0, excluded: 0, progress: 40 });

    if (totalFound === 0) {
      await db
        .update(reactivationScanJobsTable)
        .set({ status: "completed", totalFound: 0, imported: 0, duplicates: 0, excluded: 0, completedAt: new Date() })
        .where(eq(reactivationScanJobsTable.id, scanJobId));
      scanEmitter.emitProgress({ jobId: scanJobId, status: "completed", totalFound: 0, imported: 0, duplicates: 0, excluded: 0, progress: 100 });
      return;
    }

    // Collect all emails / crmIds to check for existing leads
    const emails = deals
      .map((d) => d.contact?.properties.email)
      .filter((e): e is string => Boolean(e));
    const crmIds = deals.map((d) => d.id);

    const existingByEmail = emails.length > 0
      ? await db.select({ email: leadsTable.email }).from(leadsTable)
          .where(inArray(leadsTable.email, emails))
      : [];
    const existingByCrmId = await db.select({ crmId: leadsTable.crmId }).from(leadsTable)
      .where(inArray(leadsTable.crmId, crmIds));

    const existingEmailSet = new Set(existingByEmail.map((r) => r.email.toLowerCase()));
    const existingCrmIdSet = new Set(existingByCrmId.map((r) => r.crmId).filter(Boolean) as string[]);

    let imported = 0;
    let duplicates = 0;
    let excluded = 0;

    // Process in batches of 50
    const BATCH = 50;
    for (let i = 0; i < deals.length; i += BATCH) {
      const batch = deals.slice(i, i + BATCH);
      const toInsert: typeof leadsTable.$inferInsert[] = [];

      for (const deal of batch) {
        const contact = deal.contact;

        // Skip deals without an associated contact
        if (!contact) {
          excluded++;
          continue;
        }

        const email = contact.properties.email;
        if (!email) {
          excluded++;
          continue;
        }

        const emailLower = email.toLowerCase();

        // Deduplication check
        if (existingEmailSet.has(emailLower) || existingCrmIdSet.has(deal.id)) {
          duplicates++;
          continue;
        }

        existingEmailSet.add(emailLower);
        existingCrmIdSet.add(deal.id);

        toInsert.push({
          firstName: contact.properties.firstname ?? "Unknown",
          lastName: contact.properties.lastname ?? "",
          email: emailLower,
          company: contact.properties.company ?? deal.properties.dealname ?? "Unknown",
          title: contact.properties.jobtitle ?? "",
          status: "new",
          source: "reactivation",
          industry: contact.properties.industry ?? undefined,
          companySize: contact.properties.numemployees ?? undefined,
          phone: contact.properties.phone ?? undefined,
          dealStage: deal.properties.dealstage ?? undefined,
          dealValue: deal.properties.amount ? parseFloat(deal.properties.amount) : undefined,
          crmId: deal.id,
          lostReason: deal.properties.closed_lost_reason ?? undefined,
          lastContactDate: deal.properties.hs_lastmodifieddate
            ? new Date(deal.properties.hs_lastmodifieddate)
            : undefined,
          userId,
          orgId,
        });
      }

      if (toInsert.length > 0) {
        await db.insert(leadsTable).values(toInsert);
        imported += toInsert.length;
      }

      const progress = Math.round(40 + ((i + batch.length) / deals.length) * 55);
      scanEmitter.emitProgress({ jobId: scanJobId, status: "running", totalFound, imported, duplicates, excluded, progress });
    }

    // Finalise scan job
    await db
      .update(reactivationScanJobsTable)
      .set({ status: "completed", totalFound, imported, duplicates, excluded, completedAt: new Date() })
      .where(eq(reactivationScanJobsTable.id, scanJobId));

    scanEmitter.emitProgress({ jobId: scanJobId, status: "completed", totalFound, imported, duplicates, excluded, progress: 100 });

    // Log to agent_logs
    await db.insert(agentLogsTable).values({
      agentType: "reactivation",
      action: "hubspot_scan",
      status: "completed",
      details: `Scanned HubSpot: ${totalFound} found, ${imported} imported, ${duplicates} duplicates, ${excluded} excluded`,
      userId,
      orgId,
    });

    // Update integration lastSyncAt (scoped to user)
    await db
      .update(integrationsTable)
      .set({ lastSyncAt: new Date() })
      .where(
        and(
          eq(integrationsTable.type, "hubspot"),
          eq(integrationsTable.userId, userId),
        ),
      );

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await db
      .update(reactivationScanJobsTable)
      .set({ status: "failed", error: errMsg, completedAt: new Date() })
      .where(eq(reactivationScanJobsTable.id, scanJobId));
    scanEmitter.emitProgress({ jobId: scanJobId, status: "failed", totalFound: 0, imported: 0, duplicates: 0, excluded: 0, progress: 100, error: errMsg });
    throw err;
  }
}

// ── Sequence Step Processing ──────────────────────────────────────────────────

async function processSequenceStep(stepId: number): Promise<void> {
  const [step] = await db
    .select()
    .from(campaignSequenceStepsTable)
    .where(eq(campaignSequenceStepsTable.id, stepId));

  if (!step) throw new Error(`Sequence step ${stepId} not found`);
  if (step.status !== "pending") return; // already sent or skipped

  // Check daily rate limit via Redis counter
  const rateLimited = await checkAndIncrementDailyLimit(step.orgId);
  if (rateLimited) {
    await db.insert(agentLogsTable).values({
      agentType: "reactivation",
      action: "rate_limited",
      status: "warning",
      details: `Daily outreach limit reached — skipped step ${stepId} for lead ${step.leadId}`,
      userId: step.userId ?? undefined,
      orgId: step.orgId ?? undefined,
    });
    return;
  }

  // Check if lead has already replied/booked a meeting (skip remaining steps)
  const [lead] = await db
    .select({ id: leadsTable.id, status: leadsTable.status, email: leadsTable.email, firstName: leadsTable.firstName })
    .from(leadsTable)
    .where(eq(leadsTable.id, step.leadId));

  if (!lead) {
    await db
      .update(campaignSequenceStepsTable)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(eq(campaignSequenceStepsTable.id, stepId));
    return;
  }

  if (lead.status === "replied" || lead.status === "meeting_booked") {
    await db
      .update(campaignSequenceStepsTable)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(eq(campaignSequenceStepsTable.id, stepId));
    return;
  }

  // 1. Insert outbound_messages record
  const [outMsg] = await db
    .insert(outboundMessagesTable)
    .values({
      campaignId: step.campaignId,
      leadId: step.leadId,
      provider: "resend",
      messageType: "email",
      subject: step.subject,
      body: step.body,
      status: "sending",
    })
    .returning();

  // 2. Send via Resend
  let externalMessageId = `reactivation-step-${stepId}-${Date.now()}`;
  try {
    await sendEmail({
      to: lead.email,
      subject: step.subject,
      html: `<div style="font-family:sans-serif;line-height:1.6;max-width:600px">${step.body.replace(/\n/g, "<br>")}</div>`,
      text: step.body,
    });
  } catch (sendErr) {
    // Log but don't crash the step — the message was created, mark as failed
    console.error(`[ReactivationSeq] Send failed for step ${stepId}:`, sendErr);
    if (outMsg) {
      await db
        .update(outboundMessagesTable)
        .set({ status: "failed" })
        .where(eq(outboundMessagesTable.id, outMsg.id));
    }
    throw sendErr;
  }

  // 3. Record events and update tables
  await db.transaction(async (tx: any) => {
    if (outMsg) {
      await markOutboundMessageSent(step.campaignId, step.leadId, "resend", externalMessageId, tx);
    }
    await markLeadSent(step.campaignId, step.leadId, tx);
    await createSendingEvent({
      campaignId: step.campaignId,
      leadId: step.leadId,
      provider: "resend",
      eventType: "sent",
      eventId: externalMessageId,
      payload: { source: "reactivation_sequence", stepId, stepNumber: step.stepNumber },
    }, tx);
    await applyCampaignEventDelta(step.campaignId, "sent", tx);
  });

  // 4. Update sequence step and lead status
  await db
    .update(campaignSequenceStepsTable)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date(), outboundMessageId: outMsg?.id })
    .where(eq(campaignSequenceStepsTable.id, stepId));

  await db
    .update(leadsTable)
    .set({ status: "contacted", lastContactDate: new Date() })
    .where(eq(leadsTable.id, step.leadId));

  // 5. Schedule the next pending step for this lead
  const allPendingSteps = await db
    .select()
    .from(campaignSequenceStepsTable)
    .where(eq(campaignSequenceStepsTable.campaignId, step.campaignId))
    .then((rows) =>
      rows.filter((r) => r.leadId === step.leadId && r.status === "pending" && r.stepNumber > step.stepNumber),
    );

  if (allPendingSteps.length > 0) {
    const next = allPendingSteps.sort((a, b) => a.stepNumber - b.stepNumber)[0];
    const delayMs = (next.delayDays || 0) * 24 * 60 * 60 * 1000;
    await enqueueSequenceStep(next.id, delayMs);
  }
}

// ── Daily Rate Limit (Redis) ──────────────────────────────────────────────────

let ioredis: import("ioredis").default | null = null;

async function getRedis(): Promise<import("ioredis").default | null> {
  if (!redisUrl) return null;
  if (!ioredis) {
    const { default: Redis } = await import("ioredis");
    ioredis = new Redis(redisUrl);
  }
  return ioredis;
}

async function checkAndIncrementDailyLimit(orgId: number | null): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false; // no Redis = no rate limiting (dev mode)

  const today = new Date().toISOString().slice(0, 10);
  const key = `reactivation:daily:${orgId ?? "global"}:${today}`;

  const [integration] = await db
    .select({ config: integrationsTable.config })
    .from(integrationsTable)
    .where(
      and(
        eq(integrationsTable.type, "hubspot"),
        eq(integrationsTable.apiKeyConfigured, true),
      ),
    )
    .orderBy(desc(integrationsTable.id))
    .limit(1);

  const config = integration?.config as Record<string, unknown> | null;
  const limit = Number(config?.dailyOutreachLimit) || 100;

  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, 86400); // 24-hour TTL
  }

  return current > limit;
}

export async function getDailyOutreachCount(orgId: number | null): Promise<number> {
  const redis = await getRedis();
  if (!redis) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const key = `reactivation:daily:${orgId ?? "global"}:${today}`;
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}

// ── Public Queue Helpers ──────────────────────────────────────────────────────

export async function enqueueScanJob(scanJobId: number): Promise<void> {
  const q = getScanQueue();
  if (!q) {
    setTimeout(() => void processScanJob(scanJobId), 0);
    return;
  }
  await q.add("scan", { jobId: scanJobId }, {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function enqueueSequenceStep(stepId: number, delayMs = 0): Promise<void> {
  const q = getSeqQueue();
  if (!q) {
    if (delayMs > 0) {
      setTimeout(() => void processSequenceStep(stepId), delayMs);
    } else {
      void processSequenceStep(stepId);
    }
    return;
  }
  await q.add("step", { stepId }, {
    delay: delayMs,
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

// ── Worker Registration ───────────────────────────────────────────────────────

let scanWorker: Worker<{ jobId: number }> | null = null;
let seqWorker: Worker<{ stepId: number }> | null = null;

export function startReactivationWorkers(): void {
  const conn = makeConnection();
  if (!conn) {
    console.warn("[ReactivationWorkers] REDIS_URL not set — workers disabled, jobs run inline");
    return;
  }

  if (!scanWorker) {
    scanWorker = new Worker<{ jobId: number }>(
      SCAN_QUEUE,
      async (job) => {
        console.log(`\x1b[36m[scan-worker]\x1b[0m picking up scanJobId=${job.data.jobId}`);
        await processScanJob(job.data.jobId);
        console.log(`\x1b[32m[scan-worker]\x1b[0m completed scanJobId=${job.data.jobId}`);
      },
      { connection: conn, concurrency: 2 },
    );
    scanWorker.on("failed", (job, err) =>
      console.error(`\x1b[31m[scan-worker]\x1b[0m failed scanJobId=${job?.data.jobId}: ${err.message}`),
    );
  }

  if (!seqWorker) {
    seqWorker = new Worker<{ stepId: number }>(
      SEQ_QUEUE,
      async (job) => {
        console.log(`\x1b[36m[seq-worker]\x1b[0m processing stepId=${job.data.stepId}`);
        await processSequenceStep(job.data.stepId);
      },
      { connection: conn, concurrency: 5 },
    );
    seqWorker.on("failed", (job, err) =>
      console.error(`\x1b[31m[seq-worker]\x1b[0m failed stepId=${job?.data.stepId}: ${err.message}`),
    );
  }

  console.log("[ReactivationWorkers] scan + sequence workers started");
}

export async function closeReactivationWorkers(): Promise<void> {
  await scanWorker?.close();
  await seqWorker?.close();
  await scanQueue?.close();
  await seqQueue?.close();
  scanWorker = null;
  seqWorker = null;
  scanQueue = null;
  seqQueue = null;
}
