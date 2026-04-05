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
import { getOwnerContext, ownerScope } from "../security/ownerContext";
import { outboundMcpTools } from "../lib/outboundIntegrations";

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

  conditions.push(ownerScope(leadsTable, getOwnerContext(req)));

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
  const [lead] = await db.insert(leadsTable).values({ ...parsed.data, userId: req.user!.id, orgId: req.orgId }).returning();
  res.status(201).json(GetLeadResponse.parse(lead));
});

router.get("/leads/:id", async (req, res): Promise<void> => {
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const ownerFilter = ownerScope(leadsTable, getOwnerContext(req));
  const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, params.data.id), ownerFilter));
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(GetLeadResponse.parse(lead));
});

router.patch("/leads/:id", async (req, res): Promise<void> => {
  const params = UpdateLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const ownerFilter = ownerScope(leadsTable, getOwnerContext(req));
  const [lead] = await db.update(leadsTable).set(parsed.data).where(and(eq(leadsTable.id, params.data.id), ownerFilter)).returning();
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(UpdateLeadResponse.parse(lead));
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const ownerFilter = ownerScope(leadsTable, getOwnerContext(req));
  const [lead] = await db.delete(leadsTable).where(and(eq(leadsTable.id, params.data.id), ownerFilter)).returning();
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.sendStatus(204);
});

router.post("/leads/import", async (req, res): Promise<void> => {
  const source = typeof req.body.source === "string" ? req.body.source : "apollo";
  
  try {
    const importedFromProvider = await outboundMcpTools.sourceImport(source, req.body);
    
    if (!importedFromProvider || importedFromProvider.length === 0) {
      res.json(ImportLeadsResponse.parse({ imported: 0, duplicates: 0, total: 0 }));
      return;
    }

    const leadsToInsert = importedFromProvider
      .filter((l: any) => l.email)
      .map((l: any) => ({
        firstName: String(l.firstName || "Unknown"),
        lastName: String(l.lastName || "Unknown"),
        email: String(l.email),
        company: String(l.company || "Unknown"),
        title: String(l.title || "Unknown"),
        source,
        status: "sourced",
        industry: typeof l.industry === "string" ? l.industry : null,
        companySize: typeof l.companySize === "string" ? l.companySize : null,
        linkedinUrl: typeof l.linkedinUrl === "string" ? l.linkedinUrl : null,
        userId: req.user!.id,
        orgId: req.orgId
      }));

    if (leadsToInsert.length === 0) {
      res.json(ImportLeadsResponse.parse({ imported: 0, duplicates: 0, total: 0 }));
      return;
    }

    // Doing a simple ignore-on-conflict for duplicates based on email + userId constraint if there is one
    // But simplified here to just insert what the provider gives us
    const inserted = await db.insert(leadsTable).values(leadsToInsert).returning();
    res.json(ImportLeadsResponse.parse({ imported: inserted.length, duplicates: 0, total: inserted.length }));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Import failed" });
  }
});

router.post("/leads/verify", async (req, res): Promise<void> => {
  const { leadIds } = req.body;
  if (!Array.isArray(leadIds)) { res.status(400).json({ error: "leadIds must be an array" }); return; }

  const ownerFilter = ownerScope(leadsTable, getOwnerContext(req));
  let verified = 0;
  for (const id of leadIds) {
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, id), ownerFilter));
    if (!lead) continue;

    const result = await outboundMcpTools.verify("millionverifier", lead.email);
    const isValid = result.result === "valid";

    const [updated] = await db.update(leadsTable)
      .set({ verified: isValid, status: isValid ? "verified" : "invalid" })
      .where(and(eq(leadsTable.id, id), ownerFilter))
      .returning();
    if (updated && isValid) verified++;
  }

  res.json(VerifyLeadEmailsResponse.parse({ verified, invalid: leadIds.length - verified, total: leadIds.length }));
});

export default router;
