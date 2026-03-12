import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, agentLogsTable } from "@workspace/db";
import { ListAgentLogsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/agent-logs", async (req, res): Promise<void> => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const agentType = req.query.agentType as string | undefined;

  const ownerFilter = req.orgId ? eq(agentLogsTable.orgId, req.orgId) : eq(agentLogsTable.userId, req.user!.id);
  const conditions = [ownerFilter];
  if (agentType) conditions.push(eq(agentLogsTable.agentType, agentType));

  const logs = await db.select().from(agentLogsTable)
    .where(and(...conditions))
    .orderBy(desc(agentLogsTable.timestamp))
    .limit(limit);
  res.json(ListAgentLogsResponse.parse(logs));
});

export default router;
