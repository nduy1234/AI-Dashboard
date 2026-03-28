import { Router, type IRouter } from "express";
import { db, campaignsTable, sendingEventsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import {
  GetAnalyticsOverviewResponse,
  GetAnalyticsCampaignsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/overview", async (req, res): Promise<void> => {
  const campaignFilter = req.orgId ? eq(campaignsTable.orgId, req.orgId) : eq(campaignsTable.userId, req.user!.id);

  const eventsScope = req.orgId ? eq(campaignsTable.orgId, req.orgId) : eq(campaignsTable.userId, req.user!.id);

  const [stats] = await db.select({
    sent: sql<number>`coalesce(sum(sent_count), 0)::int`,
    opens: sql<number>`coalesce(sum(open_count), 0)::int`,
    replies: sql<number>`coalesce(sum(reply_count), 0)::int`,
    meetings: sql<number>`coalesce(sum(meetings_booked), 0)::int`,
  }).from(campaignsTable).where(campaignFilter);

  const emailsSent = stats?.sent ?? 0;
  const opens = stats?.opens ?? 0;
  const replies = stats?.replies ?? 0;
  const openRate = emailsSent > 0 ? Math.round((opens / emailsSent) * 10000) / 100 : 0;
  const replyRate = emailsSent > 0 ? Math.round((replies / emailsSent) * 10000) / 100 : 0;

  const eventRows = await db
    .select({
      occurredAt: sendingEventsTable.occurredAt,
      eventType: sendingEventsTable.eventType,
    })
    .from(sendingEventsTable)
    .leftJoin(campaignsTable, eq(campaignsTable.id, sendingEventsTable.campaignId))
    .where(eventsScope);

  const dailyMap = new Map<string, { opens: number; replies: number; meetings: number; sent: number }>();
  for (const row of eventRows) {
    const dateKey = row.occurredAt.toISOString().slice(0, 10);
    const record = dailyMap.get(dateKey) ?? { opens: 0, replies: 0, meetings: 0, sent: 0 };
    if (row.eventType === "open") record.opens += 1;
    if (row.eventType === "reply") record.replies += 1;
    if (row.eventType === "meeting_booked") record.meetings += 1;
    if (row.eventType === "sent") record.sent += 1;
    dailyMap.set(dateKey, record);
  }

  const sortedDays = [...dailyMap.keys()].sort().slice(-6);
  const openRateHistory = sortedDays.map((label) => {
    const current = dailyMap.get(label)!;
    const value = current.sent > 0 ? Math.round((current.opens / current.sent) * 10000) / 100 : 0;
    return { label, value };
  });
  const replyRateHistory = sortedDays.map((label) => {
    const current = dailyMap.get(label)!;
    const value = current.sent > 0 ? Math.round((current.replies / current.sent) * 10000) / 100 : 0;
    return { label, value };
  });
  const meetingsHistory = sortedDays.map((label) => {
    const current = dailyMap.get(label)!;
    return { label, value: current.meetings };
  });
  const revenueHistory = sortedDays.map((label) => {
    const current = dailyMap.get(label)!;
    return { label, value: current.meetings * 2500 };
  });

  res.json(GetAnalyticsOverviewResponse.parse({
    openRate,
    replyRate,
    meetingsBooked: stats?.meetings ?? 0,
    leadConversions: Math.floor((stats?.meetings ?? 0) * 0.4),
    revenueGenerated: (stats?.meetings ?? 0) * 2500,
    emailsSent,
    openRateHistory,
    replyRateHistory,
    meetingsHistory,
    revenueHistory,
  }));
});

router.get("/analytics/campaigns", async (req, res): Promise<void> => {
  const campaignFilter = req.orgId ? eq(campaignsTable.orgId, req.orgId) : eq(campaignsTable.userId, req.user!.id);

  const campaigns = await db.select().from(campaignsTable)
    .where(campaignFilter)
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
