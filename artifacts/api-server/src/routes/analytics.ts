import { Router, type IRouter } from "express";
import { db, campaignsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import {
  GetAnalyticsOverviewResponse,
  GetAnalyticsCampaignsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/overview", async (req, res): Promise<void> => {
  const [stats] = await db.select({
    sent: sql<number>`coalesce(sum(sent_count), 0)::int`,
    opens: sql<number>`coalesce(sum(open_count), 0)::int`,
    replies: sql<number>`coalesce(sum(reply_count), 0)::int`,
    meetings: sql<number>`coalesce(sum(meetings_booked), 0)::int`,
  }).from(campaignsTable);

  const emailsSent = stats?.sent ?? 0;
  const opens = stats?.opens ?? 0;
  const replies = stats?.replies ?? 0;
  const openRate = emailsSent > 0 ? Math.round((opens / emailsSent) * 10000) / 100 : 0;
  const replyRate = emailsSent > 0 ? Math.round((replies / emailsSent) * 10000) / 100 : 0;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const history = (base: number) => months.map(label => ({
    label,
    value: base + Math.floor(Math.random() * base * 0.5),
  }));

  res.json(GetAnalyticsOverviewResponse.parse({
    openRate,
    replyRate,
    meetingsBooked: stats?.meetings ?? 0,
    leadConversions: Math.floor((stats?.meetings ?? 0) * 0.4),
    revenueGenerated: (stats?.meetings ?? 0) * 2500,
    emailsSent,
    openRateHistory: history(40),
    replyRateHistory: history(15),
    meetingsHistory: history(10),
    revenueHistory: history(25000),
  }));
});

router.get("/analytics/campaigns", async (req, res): Promise<void> => {
  const campaigns = await db.select().from(campaignsTable)
    .where(eq(campaignsTable.userId, req.user!.id))
    .orderBy(campaignsTable.createdAt);
  const analytics = campaigns.map(c => ({
    campaignId: c.id,
    campaignName: c.name,
    sent: c.sentCount,
    opened: c.openCount,
    replied: c.replyCount,
    meetings: c.meetingsBooked,
    conversions: Math.floor(c.meetingsBooked * 0.4),
    revenue: c.meetingsBooked * 2500,
  }));
  res.json(GetAnalyticsCampaignsResponse.parse(analytics));
});

export default router;
