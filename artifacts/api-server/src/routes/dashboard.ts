import { Router, type IRouter } from "express";
import { db, leadsTable, campaignsTable, sendingEventsTable } from "@workspace/db";
import { sql, eq, and, inArray } from "drizzle-orm";
import { GetDashboardStatsResponse, GetDashboardChartsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function computeTrend(curr: number, prev: number): number | undefined {
  if (prev === 0) return undefined; // no baseline period — omit trend badge
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const leadFilter     = req.orgId ? eq(leadsTable.orgId, req.orgId)     : eq(leadsTable.userId, req.user!.id);
  const campaignFilter = req.orgId ? eq(campaignsTable.orgId, req.orgId) : eq(campaignsTable.userId, req.user!.id);

  const now   = new Date();
  const cut30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const cut60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // ── Current totals ──────────────────────────────────────────────────────────
  const [leadCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(leadFilter);

  const [campaignStats] = await db
    .select({
      sent:     sql<number>`coalesce(sum(sent_count), 0)::int`,
      replies:  sql<number>`coalesce(sum(reply_count), 0)::int`,
      meetings: sql<number>`coalesce(sum(meetings_booked), 0)::int`,
    })
    .from(campaignsTable)
    .where(campaignFilter);

  const totalProspects = leadCount?.count ?? 0;
  const emailsSent     = campaignStats?.sent ?? 0;
  const replies        = campaignStats?.replies ?? 0;
  const replyRate      = emailsSent > 0 ? Math.min(Math.round((replies / emailsSent) * 10000) / 100, 100) : 0;
  const meetingsBooked = campaignStats?.meetings ?? 0;

  const [reactivated] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(and(leadFilter, sql`source = 'reactivation'`));

  const [conversions] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(and(leadFilter, sql`source = 'website'`));

  // ── Period-over-period trends (last 30d vs prior 30d) ──────────────────────
  const [prospectTrends] = await db
    .select({
      curr: sql<number>`count(*) FILTER (WHERE created_at >= ${cut30})::int`,
      prev: sql<number>`count(*) FILTER (WHERE created_at >= ${cut60} AND created_at < ${cut30})::int`,
    })
    .from(leadsTable)
    .where(leadFilter);

  const [reactivTrends] = await db
    .select({
      curr: sql<number>`count(*) FILTER (WHERE created_at >= ${cut30})::int`,
      prev: sql<number>`count(*) FILTER (WHERE created_at >= ${cut60} AND created_at < ${cut30})::int`,
    })
    .from(leadsTable)
    .where(and(leadFilter, sql`source = 'reactivation'`));

  const [convTrends] = await db
    .select({
      curr: sql<number>`count(*) FILTER (WHERE created_at >= ${cut30})::int`,
      prev: sql<number>`count(*) FILTER (WHERE created_at >= ${cut60} AND created_at < ${cut30})::int`,
    })
    .from(leadsTable)
    .where(and(leadFilter, sql`source = 'website'`));

  // Email / reply / meeting trends from sending_events (event-level timestamps).
  // When sending_events is empty both curr & prev are 0 → computeTrend returns null (no badge).
  const orgCampaigns = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(campaignFilter);
  const campaignIds = orgCampaigns.map((c) => c.id);

  let emailTrendCurr    = 0, emailTrendPrev    = 0;
  let replyTrendCurr    = 0, replyTrendPrev    = 0;
  let meetingTrendCurr  = 0, meetingTrendPrev  = 0;

  if (campaignIds.length > 0) {
    const [evtTrends] = await db
      .select({
        emailCurr:  sql<number>`count(*) FILTER (WHERE event_type = 'sent'           AND occurred_at >= ${cut30})::int`,
        emailPrev:  sql<number>`count(*) FILTER (WHERE event_type = 'sent'           AND occurred_at >= ${cut60} AND occurred_at < ${cut30})::int`,
        replyCurr:  sql<number>`count(*) FILTER (WHERE event_type = 'reply'          AND occurred_at >= ${cut30})::int`,
        replyPrev:  sql<number>`count(*) FILTER (WHERE event_type = 'reply'          AND occurred_at >= ${cut60} AND occurred_at < ${cut30})::int`,
        meetCurr:   sql<number>`count(*) FILTER (WHERE event_type = 'meeting_booked' AND occurred_at >= ${cut30})::int`,
        meetPrev:   sql<number>`count(*) FILTER (WHERE event_type = 'meeting_booked' AND occurred_at >= ${cut60} AND occurred_at < ${cut30})::int`,
      })
      .from(sendingEventsTable)
      .where(inArray(sendingEventsTable.campaignId, campaignIds));

    emailTrendCurr   = evtTrends?.emailCurr ?? 0;
    emailTrendPrev   = evtTrends?.emailPrev ?? 0;
    replyTrendCurr   = evtTrends?.replyCurr ?? 0;
    replyTrendPrev   = evtTrends?.replyPrev ?? 0;
    meetingTrendCurr = evtTrends?.meetCurr  ?? 0;
    meetingTrendPrev = evtTrends?.meetPrev  ?? 0;
  }

  const replyRateCurr = emailTrendCurr > 0 ? replyTrendCurr / emailTrendCurr : 0;
  const replyRatePrev = emailTrendPrev > 0 ? replyTrendPrev / emailTrendPrev : 0;

  const data = GetDashboardStatsResponse.parse({
    totalProspects,
    emailsSent,
    replyRate,
    meetingsBooked,
    reactivatedLeads:   reactivated?.count ?? 0,
    websiteConversions: conversions?.count ?? 0,
    trends: {
      totalProspects:     computeTrend(prospectTrends?.curr ?? 0, prospectTrends?.prev ?? 0),
      emailsSent:         computeTrend(emailTrendCurr,  emailTrendPrev),
      replyRate:          computeTrend(replyRateCurr * 100, replyRatePrev * 100),
      meetingsBooked:     computeTrend(meetingTrendCurr, meetingTrendPrev),
      reactivatedLeads:   computeTrend(reactivTrends?.curr ?? 0, reactivTrends?.prev ?? 0),
      websiteConversions: computeTrend(convTrends?.curr ?? 0, convTrends?.prev ?? 0),
    },
  });
  res.json(data);
});

router.get("/dashboard/charts", async (req, res): Promise<void> => {
  const campaignFilter = req.orgId ? eq(campaignsTable.orgId, req.orgId) : eq(campaignsTable.userId, req.user!.id);
  const leadFilter     = req.orgId ? eq(leadsTable.orgId, req.orgId)     : eq(leadsTable.userId, req.user!.id);

  const orgCampaigns = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(campaignFilter);
  const campaignIds = orgCampaigns.map((c) => c.id);
  const cut6m = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  // campaignIds are integer PKs from our own DB — safe to inline as a PG array literal.
  const idsClause = campaignIds.length > 0
    ? sql.raw(`ARRAY[${campaignIds.join(",")}]::integer[]`)
    : null;

  // ── Outbound Performance: sent vs replies per month (last 6 months) ─────────
  // Primary source: sending_events (granular event log).
  // Fallback: campaigns table counters grouped by launch/creation month
  //   — covers deployments where the outbound engine updates campaign counters
  //     directly without writing individual sending_events rows.
  type OutboundRow = { month: string; sent: string; replies: string };
  const outboundEventRows = idsClause
    ? await db.execute<OutboundRow>(sql`
        SELECT to_char(date_trunc('month', occurred_at), 'Mon YY') AS month,
               count(*) FILTER (WHERE event_type = 'sent')  AS sent,
               count(*) FILTER (WHERE event_type = 'reply') AS replies
        FROM   sending_events
        WHERE  campaign_id = ANY(${idsClause})
          AND  occurred_at >= ${cut6m}
          AND  event_type IN ('sent', 'reply')
        GROUP  BY date_trunc('month', occurred_at)
        ORDER  BY date_trunc('month', occurred_at)
      `)
    : { rows: [] as OutboundRow[] };

  let outboundPerformance = outboundEventRows.rows.map((r) => ({
    label:  r.month,
    value:  Number(r.sent),
    value2: Number(r.replies),
  }));

  // Fallback: aggregate campaign counters by the month the campaign was active
  if (outboundPerformance.length === 0 && campaignIds.length > 0) {
    const campOutRows = await db.execute<OutboundRow>(sql`
      SELECT to_char(date_trunc('month', coalesce(launched_at, created_at)), 'Mon YY') AS month,
             sum(sent_count)::text  AS sent,
             sum(reply_count)::text AS replies
      FROM   campaigns
      WHERE  ${campaignFilter}
        AND  coalesce(launched_at, created_at) >= ${cut6m}
      GROUP  BY date_trunc('month', coalesce(launched_at, created_at))
      ORDER  BY date_trunc('month', coalesce(launched_at, created_at))
    `);
    outboundPerformance = campOutRows.rows.map((r) => ({
      label:  r.month,
      value:  Number(r.sent),
      value2: Number(r.replies),
    }));
  }

  // ── Pipeline Generated: new leads vs meetings per month ─────────────────────
  // Primary source for meetings: sending_events meeting_booked events.
  // Fallback: campaigns.meetings_booked counters grouped by campaign month.
  type LeadRow    = { month: string; leads: string };
  type MeetingRow = { month: string; meetings: string };

  const leadRows = await db.execute<LeadRow>(sql`
    SELECT to_char(date_trunc('month', created_at), 'Mon YY') AS month,
           count(*)::int AS leads
    FROM   leads
    WHERE  ${leadFilter}
      AND  created_at >= ${cut6m}
    GROUP  BY date_trunc('month', created_at)
    ORDER  BY date_trunc('month', created_at)
  `);

  const meetingEventRows = idsClause
    ? await db.execute<MeetingRow>(sql`
        SELECT to_char(date_trunc('month', occurred_at), 'Mon YY') AS month,
               count(*)::int AS meetings
        FROM   sending_events
        WHERE  campaign_id = ANY(${idsClause})
          AND  event_type = 'meeting_booked'
          AND  occurred_at >= ${cut6m}
        GROUP  BY date_trunc('month', occurred_at)
        ORDER  BY date_trunc('month', occurred_at)
      `)
    : { rows: [] as MeetingRow[] };

  // Build meeting map: prefer event-level data, fall back to campaign counters
  let meetingMap: Map<string, number>;
  if (meetingEventRows.rows.length > 0) {
    meetingMap = new Map(meetingEventRows.rows.map((r) => [r.month, Number(r.meetings)]));
  } else if (campaignIds.length > 0) {
    const campMeetRows = await db.execute<MeetingRow>(sql`
      SELECT to_char(date_trunc('month', coalesce(launched_at, created_at)), 'Mon YY') AS month,
             sum(meetings_booked)::text AS meetings
      FROM   campaigns
      WHERE  ${campaignFilter}
        AND  coalesce(launched_at, created_at) >= ${cut6m}
      GROUP  BY date_trunc('month', coalesce(launched_at, created_at))
      ORDER  BY date_trunc('month', coalesce(launched_at, created_at))
    `);
    meetingMap = new Map(campMeetRows.rows.map((r) => [r.month, Number(r.meetings)]));
  } else {
    meetingMap = new Map();
  }

  const pipelineGenerated = leadRows.rows.map((r) => ({
    label:  r.month,
    value:  Number(r.leads),
    value2: meetingMap.get(r.month) ?? 0,
  }));

  // ── Conversion Funnel: real aggregates ─────────────────────────────────────
  const [totals] = await db
    .select({ prospects: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(leadFilter);

  const [campTotals] = await db
    .select({
      sent:     sql<number>`coalesce(sum(sent_count), 0)::int`,
      replied:  sql<number>`coalesce(sum(reply_count), 0)::int`,
      meetings: sql<number>`coalesce(sum(meetings_booked), 0)::int`,
    })
    .from(campaignsTable)
    .where(campaignFilter);

  const [webConv] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(and(leadFilter, sql`source = 'website'`));

  const conversionFunnel = [
    { stage: "Prospects",   count: totals?.prospects    ?? 0 },
    { stage: "Emailed",     count: campTotals?.sent     ?? 0 },
    { stage: "Replied",     count: campTotals?.replied  ?? 0 },
    { stage: "Meetings",    count: campTotals?.meetings ?? 0 },
    { stage: "Conversions", count: webConv?.count       ?? 0 },
  ];

  const data = GetDashboardChartsResponse.parse({
    outboundPerformance,
    pipelineGenerated,
    conversionFunnel,
  });
  res.json(data);
});

export default router;
