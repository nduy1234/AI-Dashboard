import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireOrgRole } from "../middlewares/requireRole";
import { requireIdempotencyKey } from "../middlewares/requireIdempotencyKey";
import { getOutboundRuntimeConfig, isOutboundProviderEnabled } from "../lib/outboundConfig";
import { getOwnerContext } from "../security/ownerContext";
import {
  createOrGetJob,
  getCampaignPerformance,
  getLeadPipeline,
  getOwnedJob,
  retryJob,
  runPilot,
} from "../services/outboundService";
import { enqueueOutboundJob } from "../lib/outboundQueue";

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
    const owner = getOwnerContext(req);
    const job = await createOrGetJob("import", payload as unknown as Record<string, unknown>, owner, req.header("Idempotency-Key") ?? null);

    await enqueueOutboundJob(job.id);
    res.status(202).json({ jobId: job.id, status: "queued" });
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
    const owner = getOwnerContext(req);
    const provider = parsed.data.provider ?? "clay";
    if (!isOutboundProviderEnabled(provider)) {
      res.status(400).json({ error: `Provider '${provider}' is disabled` });
      return;
    }
    const job = await createOrGetJob("enrich", { ...parsed.data, provider }, owner, req.header("Idempotency-Key") ?? null);

    await enqueueOutboundJob(job.id);
    res.status(202).json({ jobId: job.id, status: "queued" });
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
    const owner = getOwnerContext(req);
    const provider = parsed.data.provider ?? "millionverifier";
    const job = await createOrGetJob("verify", { ...parsed.data, provider }, owner, req.header("Idempotency-Key") ?? null);

    await enqueueOutboundJob(job.id);
    res.status(202).json({ jobId: job.id, status: "queued" });
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

    const owner = getOwnerContext(req);
    const job = await createOrGetJob("personalize", parsed.data as unknown as Record<string, unknown>, owner, req.header("Idempotency-Key") ?? null);

    await enqueueOutboundJob(job.id);
    res.status(202).json({ jobId: job.id, status: "queued" });
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
    const owner = getOwnerContext(req);
    if (!isOutboundProviderEnabled(parsed.data.provider)) {
      res.status(400).json({ error: `Provider '${parsed.data.provider}' is disabled` });
      return;
    }
    const job = await createOrGetJob("launch", parsed.data as unknown as Record<string, unknown>, owner, req.header("Idempotency-Key") ?? null);

    await enqueueOutboundJob(job.id);
    res.status(202).json({ jobId: job.id, status: "queued" });
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

    const owner = getOwnerContext(req);
    const result = await retryJob(owner, jobId);
    if (!result) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    await enqueueOutboundJob(jobId);
    res.json(result);
  },
);

router.get("/outbound/jobs/:id", async (req, res): Promise<void> => {
  const jobId = Number(req.params.id);
  if (!Number.isFinite(jobId)) {
    res.status(400).json({ error: "Invalid job id" });
    return;
  }

  const owner = getOwnerContext(req);
  const job = await getOwnedJob(owner, jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

router.get("/outbound/leads/pipeline", async (req, res): Promise<void> => {
  const owner = getOwnerContext(req);
  const metrics = await getLeadPipeline(owner);
  res.json(metrics);
});

router.get("/outbound/config", async (_req, res): Promise<void> => {
  res.json(getOutboundRuntimeConfig());
});

router.get("/outbound/campaigns/:id/performance", async (req, res): Promise<void> => {
  const campaignId = Number(req.params.id);
  if (!Number.isFinite(campaignId)) {
    res.status(400).json({ error: "Invalid campaign id" });
    return;
  }

  const owner = getOwnerContext(req);
  const performance = await getCampaignPerformance(owner, campaignId);
  if (!performance) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(performance);
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

    const owner = getOwnerContext(req);
    const pilot = await runPilot(owner, campaignId);
    if (!pilot) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    res.json(pilot);
  },
);

export default router;
