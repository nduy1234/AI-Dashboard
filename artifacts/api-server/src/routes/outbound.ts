import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireOrgRole } from "../middlewares/requireRole";
import { requireIdempotencyKey } from "../middlewares/requireIdempotencyKey";
import { outboundPhaseOneConfig } from "../lib/outboundConfig";
import { getOwnerContext } from "../security/ownerContext";
import {
  createOrGetJob,
  getCampaignPerformance,
  getLeadPipeline,
  getOwnedJob,
  retryJob,
  runEnrichJob,
  runImportJob,
  runLaunchJob,
  runPersonalizeJob,
  runPilot,
  runVerifyJob,
} from "../services/outboundService";

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

    try {
      const result = await runImportJob(owner, job.id, payload);
      res.status(201).json({ jobId: job.id, ...result });
    } catch (error) {
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
    const owner = getOwnerContext(req);
    const provider = parsed.data.provider ?? "clay";
    const job = await createOrGetJob("enrich", { ...parsed.data, provider }, owner, req.header("Idempotency-Key") ?? null);

    try {
      const result = await runEnrichJob(owner, job.id, { leadIds: parsed.data.leadIds, provider });
      res.json({ jobId: job.id, ...result });
    } catch (error) {
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
    const owner = getOwnerContext(req);
    const provider = parsed.data.provider ?? "millionverifier";
    const job = await createOrGetJob("verify", { ...parsed.data, provider }, owner, req.header("Idempotency-Key") ?? null);

    try {
      const result = await runVerifyJob(owner, job.id, { leadIds: parsed.data.leadIds, provider });
      res.json({ jobId: job.id, ...result });
    } catch (error) {
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

    const owner = getOwnerContext(req);
    const job = await createOrGetJob("personalize", parsed.data as unknown as Record<string, unknown>, owner, req.header("Idempotency-Key") ?? null);

    try {
      const result = await runPersonalizeJob(owner, job.id, parsed.data);
      res.json({ jobId: job.id, ...result });
    } catch (error) {
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
    const owner = getOwnerContext(req);
    const job = await createOrGetJob("launch", parsed.data as unknown as Record<string, unknown>, owner, req.header("Idempotency-Key") ?? null);

    try {
      const result = await runLaunchJob(owner, job.id, parsed.data);
      if (!result) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }
      res.json({ jobId: job.id, ...result });
    } catch (error) {
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

    const owner = getOwnerContext(req);
    const result = await retryJob(owner, jobId);
    if (!result) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
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
  res.json(outboundPhaseOneConfig);
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
