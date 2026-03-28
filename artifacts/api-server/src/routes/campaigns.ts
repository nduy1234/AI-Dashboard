import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, campaignsTable } from "@workspace/db";
import {
  ListCampaignsResponse,
  CreateCampaignBody,
  GetCampaignParams,
  GetCampaignResponse,
  UpdateCampaignParams,
  UpdateCampaignBody,
  UpdateCampaignResponse,
  DeleteCampaignParams,
  LaunchCampaignParams,
  LaunchCampaignResponse,
  PauseCampaignParams,
  PauseCampaignResponse,
} from "@workspace/api-zod";
import { getOwnerContext, ownerScope } from "../security/ownerContext";

const router: IRouter = Router();

function campaignOwnerFilter(req: Express.Request) {
  return ownerScope(campaignsTable, getOwnerContext(req));
}

router.get("/campaigns", async (req, res): Promise<void> => {
  const conditions = [];
  conditions.push(campaignOwnerFilter(req));
  if (req.query.type && typeof req.query.type === "string") conditions.push(eq(campaignsTable.type, req.query.type));
  if (req.query.status && typeof req.query.status === "string") conditions.push(eq(campaignsTable.status, req.query.status));

  const campaigns = await db.select().from(campaignsTable)
    .where(and(...conditions))
    .orderBy(campaignsTable.createdAt);
  res.json(ListCampaignsResponse.parse(campaigns));
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { leadIds, emailSequence, ...campaignData } = parsed.data;
  const [campaign] = await db.insert(campaignsTable).values({
    ...campaignData,
    emailSequenceCount: emailSequence?.length ?? 0,
    leadCount: leadIds?.length ?? 0,
    userId: req.user!.id,
    orgId: req.orgId,
  }).returning();
  res.status(201).json(GetCampaignResponse.parse(campaign));
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [campaign] = await db.select().from(campaignsTable).where(and(eq(campaignsTable.id, params.data.id), campaignOwnerFilter(req)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(GetCampaignResponse.parse(campaign));
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  const params = UpdateCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { emailSequence, ...updateData } = parsed.data;
  const setData: Record<string, unknown> = { ...updateData };
  if (emailSequence) setData.emailSequenceCount = emailSequence.length;
  const [campaign] = await db.update(campaignsTable).set(setData).where(and(eq(campaignsTable.id, params.data.id), campaignOwnerFilter(req))).returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(UpdateCampaignResponse.parse(campaign));
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const params = DeleteCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [campaign] = await db.delete(campaignsTable).where(and(eq(campaignsTable.id, params.data.id), campaignOwnerFilter(req))).returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.sendStatus(204);
});

router.post("/campaigns/:id/launch", async (req, res): Promise<void> => {
  const params = LaunchCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [campaign] = await db.update(campaignsTable)
    .set({ status: "active", launchedAt: new Date() })
    .where(and(eq(campaignsTable.id, params.data.id), campaignOwnerFilter(req))).returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(LaunchCampaignResponse.parse(campaign));
});

router.post("/campaigns/:id/pause", async (req, res): Promise<void> => {
  const params = PauseCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [campaign] = await db.update(campaignsTable)
    .set({ status: "paused" })
    .where(and(eq(campaignsTable.id, params.data.id), campaignOwnerFilter(req))).returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(PauseCampaignResponse.parse(campaign));
});

export default router;
