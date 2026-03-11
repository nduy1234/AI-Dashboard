import { Router, type IRouter } from "express";
import { eq, ilike, or, and, sql } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import {
  ListLeadsResponse,
  CreateLeadBody,
  GetLeadParams,
  GetLeadResponse,
  UpdateLeadParams,
  UpdateLeadBody,
  UpdateLeadResponse,
  DeleteLeadParams,
  ImportLeadsResponse,
  VerifyLeadEmailsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leads", async (req, res): Promise<void> => {
  const { status, source, search } = req.query;
  const conditions = [];
  if (status && typeof status === "string") conditions.push(eq(leadsTable.status, status));
  if (source && typeof source === "string") conditions.push(eq(leadsTable.source, source));
  if (search && typeof search === "string") {
    conditions.push(
      or(
        ilike(leadsTable.firstName, `%${search}%`),
        ilike(leadsTable.lastName, `%${search}%`),
        ilike(leadsTable.email, `%${search}%`),
        ilike(leadsTable.company, `%${search}%`)
      )!
    );
  }

  if (req.user?.id) conditions.push(eq(leadsTable.userId, req.user.id));

  const leads = await db.select().from(leadsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(leadsTable.createdAt);

  res.json(ListLeadsResponse.parse(leads));
});

router.post("/leads", async (req, res): Promise<void> => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [lead] = await db.insert(leadsTable).values({ ...parsed.data, userId: req.user?.id }).returning();
  res.status(201).json(GetLeadResponse.parse(lead));
});

router.get("/leads/:id", async (req, res): Promise<void> => {
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.userId, req.user!.id)));
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(GetLeadResponse.parse(lead));
});

router.patch("/leads/:id", async (req, res): Promise<void> => {
  const params = UpdateLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [lead] = await db.update(leadsTable).set(parsed.data).where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.userId, req.user!.id))).returning();
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(UpdateLeadResponse.parse(lead));
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [lead] = await db.delete(leadsTable).where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.userId, req.user!.id))).returning();
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.sendStatus(204);
});

router.post("/leads/import", async (req, res): Promise<void> => {
  const sampleLeads = [
    { firstName: "Sarah", lastName: "Chen", email: "sarah.chen@techcorp.com", company: "TechCorp", title: "VP of Sales", source: "apollo", industry: "Technology", companySize: "200-500" },
    { firstName: "Michael", lastName: "Rodriguez", email: "m.rodriguez@globalinc.com", company: "Global Inc", title: "CTO", source: "apollo", industry: "Finance", companySize: "500-1000" },
    { firstName: "Emily", lastName: "Thompson", email: "emily.t@startuplab.io", company: "StartupLab", title: "Head of Growth", source: "apollo", industry: "SaaS", companySize: "50-200" },
  ];

  const inserted = await db.insert(leadsTable).values(sampleLeads.map(l => ({ ...l, userId: req.user?.id }))).returning();
  res.json(ImportLeadsResponse.parse({ imported: inserted.length, duplicates: 0, total: inserted.length }));
});

router.post("/leads/verify", async (req, res): Promise<void> => {
  const { leadIds } = req.body;
  if (!Array.isArray(leadIds)) { res.status(400).json({ error: "leadIds must be an array" }); return; }

  let verified = 0;
  for (const id of leadIds) {
    const isValid = Math.random() > 0.15;
    await db.update(leadsTable).set({ verified: isValid, status: isValid ? "verified" : "invalid" }).where(eq(leadsTable.id, id));
    if (isValid) verified++;
  }

  res.json(VerifyLeadEmailsResponse.parse({ verified, invalid: leadIds.length - verified, total: leadIds.length }));
});

export default router;
