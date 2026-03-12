import { Router, type IRouter } from "express";
import { db, leadsTable, campaignsTable, emailAccountsTable } from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";
import { GetDashboardStatsResponse, GetDashboardChartsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const leadFilter = req.orgId ? eq(leadsTable.orgId, req.orgId) : eq(leadsTable.userId, req.user!.id);
  const campaignFilter = req.orgId ? eq(campaignsTable.orgId, req.orgId) : eq(campaignsTable.userId, req.user!.id);

  const [leadCount] = await db.select({ count: sql<number>`count(*)::int` }).from(leadsTable).where(leadFilter);
  const [campaignStats] = await db.select({
    sent: sql<number>`coalesce(sum(sent_count), 0)::int`,
    replies: sql<number>`coalesce(sum(reply_count), 0)::int`,
    meetings: sql<number>`coalesce(sum(meetings_booked), 0)::int`,
  }).from(campaignsTable).where(campaignFilter);

  const totalProspects = leadCount?.count ?? 0;
  const emailsSent = campaignStats?.sent ?? 0;
  const replies = campaignStats?.replies ?? 0;
  const replyRate = emailsSent > 0 ? Math.round((replies / emailsSent) * 10000) / 100 : 0;
  const meetingsBooked = campaignStats?.meetings ?? 0;

  const [reactivated] = await db.select({ count: sql<number>`count(*)::int` }).from(leadsTable).where(and(leadFilter, sql`source = 'reactivation'`));
  const [conversions] = await db.select({ count: sql<number>`count(*)::int` }).from(leadsTable).where(and(leadFilter, sql`source = 'website'`));

  const data = GetDashboardStatsResponse.parse({
    totalProspects,
    emailsSent,
    replyRate,
    meetingsBooked,
    reactivatedLeads: reactivated?.count ?? 0,
    websiteConversions: conversions?.count ?? 0,
  });
  res.json(data);
});

router.get("/dashboard/charts", async (req, res): Promise<void> => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const outboundPerformance = months.map((label) => ({
    label,
    value: Math.floor(Math.random() * 500) + 100,
    value2: Math.floor(Math.random() * 100) + 20,
  }));

  const pipelineGenerated = months.map((label) => ({
    label,
    value: Math.floor(Math.random() * 50000) + 10000,
  }));

  const conversionFunnel = [
    { stage: "Visitors", count: 12500 },
    { stage: "Engaged", count: 4200 },
    { stage: "Qualified", count: 1800 },
    { stage: "Meetings", count: 420 },
    { stage: "Closed", count: 85 },
  ];

  const data = GetDashboardChartsResponse.parse({
    outboundPerformance,
    pipelineGenerated,
    conversionFunnel,
  });
  res.json(data);
});

export default router;
