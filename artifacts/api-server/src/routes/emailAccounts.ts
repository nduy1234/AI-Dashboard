import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, emailAccountsTable } from "@workspace/db";
import {
  ListEmailAccountsResponse,
  CreateEmailAccountBody,
  DeleteEmailAccountParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function ownerFilter(req: Express.Request) {
  return req.orgId ? eq(emailAccountsTable.orgId, req.orgId) : eq(emailAccountsTable.userId, req.user!.id);
}

router.get("/email-accounts", async (req, res): Promise<void> => {
  const accounts = await db.select().from(emailAccountsTable)
    .where(ownerFilter(req))
    .orderBy(emailAccountsTable.createdAt);
  res.json(ListEmailAccountsResponse.parse(accounts));
});

router.post("/email-accounts", async (req, res): Promise<void> => {
  const parsed = CreateEmailAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [account] = await db.insert(emailAccountsTable).values({ ...parsed.data, userId: req.user!.id, orgId: req.orgId }).returning();
  res.status(201).json(account);
});

router.delete("/email-accounts/:id", async (req, res): Promise<void> => {
  const params = DeleteEmailAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [account] = await db.delete(emailAccountsTable).where(and(eq(emailAccountsTable.id, params.data.id), ownerFilter(req))).returning();
  if (!account) { res.status(404).json({ error: "Email account not found" }); return; }
  res.sendStatus(204);
});

export default router;
