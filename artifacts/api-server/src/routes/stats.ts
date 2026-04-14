/**
 * Stats detail routes — power the drill-down stat pages on the frontend.
 * All endpoints are scoped to the authenticated user / org.
 */
import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  leadsTable,
  campaignsTable,
  sendingEventsTable,
  outboundMessagesTable,
  agentLogsTable,
  emailRepliesTable,
  campaignSequenceStepsTable,
} from "@workspace/db";

const router: IRouter = Router();

const AGENT_NAME_MAP: Record<string, string> = {
  outbound:      "Outbound Agent",
  email:         "Email Agent",
  reactivation:  "Reactivation Bot",
  conversion:    "Conversion Agent",
  meeting:       "Meeting Agent",
  enrichment:    "Enrichment Agent",
  qualification: "Qualification Agent",
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /stats/emails  — detailed email log for Emails Sent drill-down page
// ─────────────────────────────────────────────────────────────────────────────
router.get("/stats/emails", async (req, res): Promise<void> => {
  const ownerFilter = req.orgId
    ? eq(campaignsTable.orgId, req.orgId)
    : eq(campaignsTable.userId, req.user!.id);

  // Aggregate KPIs from campaigns table
  const [kpi] = await db
    .select({
      totalSent: sql<number>`coalesce(sum(sent_count),0)::int`,
      totalOpen: sql<number>`coalesce(sum(open_count),0)::int`,
      totalReply: sql<number>`coalesce(sum(reply_count),0)::int`,
    })
    .from(campaignsTable)
    .where(ownerFilter);

  // Bounce count from sending_events (event_type = 'bounce')
  // We can't filter sending_events by user directly — join through campaign
  const [bounceRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sendingEventsTable)
    .leftJoin(campaignsTable, eq(campaignsTable.id, sendingEventsTable.campaignId))
    .where(
      and(
        eq(sendingEventsTable.eventType, "bounce"),
        ownerFilter,
      ),
    );

  const totalSent = kpi?.totalSent ?? 0;
  const totalOpen = kpi?.totalOpen ?? 0;
  const totalReply = kpi?.totalReply ?? 0;
  const totalBounce = bounceRow?.count ?? 0;
  const delivered = Math.max(0, totalSent - totalBounce);

  // Daily send-volume over the past 14 days from sending_events
  const raw = await db
    .select({
      day: sql<string>`to_char(${sendingEventsTable.occurredAt} at time zone 'UTC', 'Mon DD')`,
      cnt: sql<number>`count(*)::int`,
    })
    .from(sendingEventsTable)
    .leftJoin(campaignsTable, eq(campaignsTable.id, sendingEventsTable.campaignId))
    .where(
      and(
        eq(sendingEventsTable.eventType, "sent"),
        sql`${sendingEventsTable.occurredAt} > now() - interval '14 days'`,
        ownerFilter,
      ),
    )
    .groupBy(sql`to_char(${sendingEventsTable.occurredAt} at time zone 'UTC', 'Mon DD'), date_trunc('day', ${sendingEventsTable.occurredAt})`)
    .orderBy(sql`date_trunc('day', ${sendingEventsTable.occurredAt})`);

  // Recent outbound messages as email log rows
  const messages = await db
    .select({
      id: outboundMessagesTable.id,
      subject: outboundMessagesTable.subject,
      status: outboundMessagesTable.status,
      sentAt: outboundMessagesTable.sentAt,
      campaignId: outboundMessagesTable.campaignId,
      leadId: outboundMessagesTable.leadId,
      firstName: leadsTable.firstName,
      lastName: leadsTable.lastName,
      email: leadsTable.email,
      company: leadsTable.company,
    })
    .from(outboundMessagesTable)
    .leftJoin(leadsTable, eq(leadsTable.id, outboundMessagesTable.leadId))
    .leftJoin(campaignsTable, eq(campaignsTable.id, outboundMessagesTable.campaignId))
    .where(
      and(
        eq(outboundMessagesTable.status, "sent"),
        ownerFilter,
      ),
    )
    .orderBy(desc(outboundMessagesTable.sentAt))
    .limit(100);

  // Campaign name lookup
  const campaignIds = [...new Set(messages.map((m) => m.campaignId).filter(Boolean))] as number[];
  const campaigns =
    campaignIds.length > 0
      ? await db
          .select({ id: campaignsTable.id, name: campaignsTable.name })
          .from(campaignsTable)
          .where(
            and(
              sql`${campaignsTable.id} = ANY(ARRAY[${sql.join(campaignIds.map((id) => sql`${id}`), sql`, `)}]::int[])`,
              ownerFilter,
            ),
          )
      : [];
  const campaignMap = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));

  const emailLog = messages.map((m) => ({
    id: m.id,
    to: m.email ?? "",
    name: `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim(),
    subject: m.subject,
    campaign: campaignMap[m.campaignId!] ?? "Unknown Campaign",
    sentAt: m.sentAt ? m.sentAt.toISOString() : null,
    status: m.status,
    opened: false, // event-level opening tracked via sending_events in real deployments
    replied: false,
  }));

  res.json({
    kpi: {
      totalSent,
      delivered,
      opened: totalOpen,
      bounced: totalBounce,
      replied: totalReply,
    },
    sendVolume: {
      labels: raw.map((r) => r.day),
      data: raw.map((r) => r.cnt),
    },
    emails: emailLog,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /stats/meetings  — meetings detail for Meetings Booked drill-down page
// ─────────────────────────────────────────────────────────────────────────────
router.get("/stats/meetings", async (req, res): Promise<void> => {
  const ownerFilter = req.orgId
    ? eq(campaignsTable.orgId, req.orgId)
    : eq(campaignsTable.userId, req.user!.id);

  // Meetings booked from campaigns
  const campaigns = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      meetingsBooked: campaignsTable.meetingsBooked,
      sentCount: campaignsTable.sentCount,
      replyCount: campaignsTable.replyCount,
    })
    .from(campaignsTable)
    .where(ownerFilter)
    .orderBy(desc(campaignsTable.createdAt));

  const totalMeetings = campaigns.reduce((s, c) => s + (c.meetingsBooked ?? 0), 0);

  // Leads that booked meetings (deal_stage = 'meeting_booked' or status = 'meeting_booked')
  const leadsOwner = req.orgId
    ? eq(leadsTable.orgId, req.orgId)
    : eq(leadsTable.userId, req.user!.id);

  const meetingLeads = await db
    .select()
    .from(leadsTable)
    .where(
      and(
        leadsOwner,
        sql`(status = 'meeting_booked' OR deal_stage = 'meeting_booked')`,
      ),
    )
    .orderBy(desc(leadsTable.updatedAt))
    .limit(50);

  // Monthly meetings trend from campaigns (by month of launchedAt)
  const monthlyRaw = await db
    .select({
      month: sql<string>`to_char(launched_at, 'Mon YYYY')`,
      meetings: sql<number>`sum(meetings_booked)::int`,
    })
    .from(campaignsTable)
    .where(and(ownerFilter, sql`launched_at is not null`))
    .groupBy(sql`to_char(launched_at, 'Mon YYYY'), date_trunc('month', launched_at)`)
    .orderBy(sql`date_trunc('month', launched_at)`);

  res.json({
    total: totalMeetings,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      meetings: c.meetingsBooked,
      sent: c.sentCount,
      replies: c.replyCount,
    })),
    leads: meetingLeads.map((l) => ({
      id: l.id,
      name: `${l.firstName} ${l.lastName}`,
      company: l.company,
      title: l.title,
      email: l.email,
      status: l.status,
      dealStage: l.dealStage,
      engagementScore: l.engagementScore,
      lastContactDate: l.lastContactDate,
    })),
    monthlyTrend: monthlyRaw.map((r) => ({ label: r.month, value: r.meetings })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /stats/reply-rate  — reply rate trend and campaign breakdown
// ─────────────────────────────────────────────────────────────────────────────
router.get("/stats/reply-rate", async (req, res): Promise<void> => {
  const ownerFilter = req.orgId
    ? eq(campaignsTable.orgId, req.orgId)
    : eq(campaignsTable.userId, req.user!.id);

  // ── KPI totals from campaigns table ────────────────────────────────────────
  const [totals] = await db
    .select({
      totalSent:  sql<number>`coalesce(sum(sent_count), 0)::int`,
      totalReply: sql<number>`coalesce(sum(reply_count), 0)::int`,
    })
    .from(campaignsTable)
    .where(ownerFilter);

  // ── Positive / negative reply breakdown from email_replies ─────────────────
  // email_replies.sentiment is set to 'positive' for positive_reply events,
  // 'negative' for unsubscribe-type replies, and 'unknown' otherwise.
  const [sentimentCounts] = await db
    .select({
      positive: sql<number>`coalesce(sum(case when ${emailRepliesTable.sentiment}='positive' then 1 else 0 end),0)::int`,
      negative: sql<number>`coalesce(sum(case when ${emailRepliesTable.sentiment}='negative' then 1 else 0 end),0)::int`,
    })
    .from(emailRepliesTable)
    .leftJoin(campaignsTable, eq(campaignsTable.id, emailRepliesTable.campaignId))
    .where(ownerFilter);

  const totalSent       = totals?.totalSent  ?? 0;
  const totalReplies    = totals?.totalReply ?? 0;
  const positiveReplies = sentimentCounts?.positive ?? 0;
  const negativeReplies = sentimentCounts?.negative ?? 0;

  // ── Per-campaign breakdown ─────────────────────────────────────────────────
  const campaigns = await db
    .select({
      id:         campaignsTable.id,
      name:       campaignsTable.name,
      sentCount:  campaignsTable.sentCount,
      replyCount: campaignsTable.replyCount,
    })
    .from(campaignsTable)
    .where(ownerFilter)
    .orderBy(desc(campaignsTable.replyCount));

  const campaignBreakdown = campaigns.map((c) => ({
    campaign: c.name,
    sent:     c.sentCount,
    replies:  c.replyCount,
    rate:     c.sentCount > 0
      ? Math.round((c.replyCount / c.sentCount) * 10000) / 100
      : 0,
  }));

  // ── Weekly reply-rate history via sending_events ───────────────────────────
  const weeklyRaw = await db
    .select({
      week:    sql<string>`to_char(date_trunc('week', ${sendingEventsTable.occurredAt}), 'Mon DD')`,
      replies: sql<number>`count(case when ${sendingEventsTable.eventType}='reply' then 1 end)::int`,
      sent:    sql<number>`count(case when ${sendingEventsTable.eventType}='sent'  then 1 end)::int`,
    })
    .from(sendingEventsTable)
    .leftJoin(campaignsTable, eq(campaignsTable.id, sendingEventsTable.campaignId))
    .where(
      and(
        sql`${sendingEventsTable.occurredAt} > now() - interval '12 weeks'`,
        ownerFilter,
      ),
    )
    .groupBy(sql`date_trunc('week', ${sendingEventsTable.occurredAt})`)
    .orderBy(sql`date_trunc('week', ${sendingEventsTable.occurredAt})`);

  const historyLabels = weeklyRaw.map((r) => r.week);
  const historyRate   = weeklyRaw.map((r) =>
    r.sent > 0 ? Math.round((r.replies / r.sent) * 10000) / 100 : 0,
  );

  res.json({
    totalSent,
    totalReplies,
    positiveReplies,
    negativeReplies,
    campaignBreakdown,
    historyLabels,
    historyRate,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /stats/reactivations  — reactivation leads and stats
// ─────────────────────────────────────────────────────────────────────────────
router.get("/stats/reactivations", async (req, res): Promise<void> => {
  const leadsOwner = req.orgId
    ? eq(leadsTable.orgId, req.orgId)
    : eq(leadsTable.userId, req.user!.id);

  const reactivatedLeads = await db
    .select()
    .from(leadsTable)
    .where(and(leadsOwner, eq(leadsTable.source, "reactivation")))
    .orderBy(desc(leadsTable.updatedAt))
    .limit(100);

  const ownerFilter = req.orgId
    ? eq(campaignsTable.orgId, req.orgId)
    : eq(campaignsTable.userId, req.user!.id);

  const reactivationCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(and(ownerFilter, eq(campaignsTable.type, "reactivation")));

  const totalSent = reactivationCampaigns.reduce((s, c) => s + (c.sentCount ?? 0), 0);
  const totalReplies = reactivationCampaigns.reduce((s, c) => s + (c.replyCount ?? 0), 0);
  const totalMeetings = reactivationCampaigns.reduce((s, c) => s + (c.meetingsBooked ?? 0), 0);

  // Sequence step breakdown across all reactivation campaigns
  const campaignIds = reactivationCampaigns.map((c) => c.id);
  let sequenceStepBreakdown: Record<string, number> = {};
  let sequenceStepConversions: Array<{ step: number; sent: number; replied: number }> = [];

  if (campaignIds.length > 0) {
    const allSteps = await db
      .select({
        stepNumber: campaignSequenceStepsTable.stepNumber,
        status: campaignSequenceStepsTable.status,
        leadId: campaignSequenceStepsTable.leadId,
      })
      .from(campaignSequenceStepsTable)
      .where(sql`${campaignSequenceStepsTable.campaignId} = ANY(ARRAY[${sql.join(campaignIds.map((id) => sql`${id}`), sql`, `)}]::int[])`);

    for (const s of allSteps) {
      sequenceStepBreakdown[s.status] = (sequenceStepBreakdown[s.status] ?? 0) + 1;
    }

    // Per-step sent/replied counts (join with lead status)
    const stepNums = [...new Set(allSteps.map((s) => s.stepNumber))].sort((a, b) => a - b);
    for (const stepNum of stepNums) {
      const stepRows = allSteps.filter((s) => s.stepNumber === stepNum);
      const sentRows = stepRows.filter((s) => s.status === "sent");
      const sentLeadIds = sentRows.map((s) => s.leadId);
      let replied = 0;
      if (sentLeadIds.length > 0) {
        const repliedLeads = reactivatedLeads.filter(
          (l) => sentLeadIds.includes(l.id) && (l.status === "replied" || l.status === "meeting_booked"),
        );
        replied = repliedLeads.length;
      }
      sequenceStepConversions.push({ step: stepNum, sent: sentRows.length, replied });
    }
  }

  res.json({
    stats: {
      dormantLeads: reactivatedLeads.filter((l) => l.status === "new" || l.status === "contacted").length,
      campaigns: reactivationCampaigns.length,
      reEngaged: reactivatedLeads.filter(
        (l) => l.status === "replied" || l.status === "meeting_booked",
      ).length,
      meetings: totalMeetings,
      totalSent,
      totalReplies,
    },
    sequenceStepBreakdown,
    sequenceStepConversions,
    leads: reactivatedLeads.map((l) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      company: l.company,
      title: l.title,
      email: l.email,
      status: l.status,
      engagementScore: l.engagementScore,
      lastContactDate: l.lastContactDate,
      crmId: (l as any).crmId ?? null,
      lostReason: (l as any).lostReason ?? null,
      notes: l.notes,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /stats/conversions  — closed deals / conversions
// ─────────────────────────────────────────────────────────────────────────────
router.get("/stats/conversions", async (req, res): Promise<void> => {
  const leadsOwner = req.orgId
    ? eq(leadsTable.orgId, req.orgId)
    : eq(leadsTable.userId, req.user!.id);

  const conversions = await db
    .select()
    .from(leadsTable)
    .where(
      and(
        leadsOwner,
        sql`(status = 'converted' OR deal_stage IN ('closed_won','customer'))`,
      ),
    )
    .orderBy(desc(leadsTable.updatedAt))
    .limit(100);

  const totalARR = conversions.reduce((s, l) => s + (l.dealValue ?? 0), 0);
  const avgDaysToClose = 0; // can be derived from updatedAt - createdAt if desired

  // Count leads in meeting/demo stage (pipeline behind conversions)
  const [pipelineRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(
      and(
        leadsOwner,
        sql`deal_stage IN ('meeting','demo','proposal','negotiation')`,
      ),
    );

  res.json({
    stats: {
      totalConversions: conversions.length,
      totalARR,
      avgDaysToClose,
      avgDealValue: conversions.length > 0 ? Math.round(totalARR / conversions.length) : 0,
    },
    pipelineCount: pipelineRow?.count ?? 0,
    conversions: conversions.map((l) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      company: l.company,
      title: l.title,
      email: l.email,
      status: l.status,
      dealStage: l.dealStage,
      dealValue: l.dealValue,
      engagementScore: l.engagementScore,
      notes: l.notes,
      updatedAt: l.updatedAt,
      createdAt: l.createdAt,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /stats/agent-activity  — recent agent activity feed for dashboard
// ─────────────────────────────────────────────────────────────────────────────
router.get("/stats/agent-activity", async (req, res): Promise<void> => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

  const ownerFilter = req.orgId
    ? eq(agentLogsTable.orgId, req.orgId)
    : eq(agentLogsTable.userId, req.user!.id);

  const logs = await db
    .select()
    .from(agentLogsTable)
    .where(ownerFilter)
    .orderBy(desc(agentLogsTable.timestamp))
    .limit(limit);

  res.json(
    logs.map((l) => ({
      // Schema-contract fields (agent, timestamp) — kept for API compatibility
      id: l.id,
      agent: l.agentType,
      action: l.action,
      status: l.status,
      details: l.details,
      timestamp: l.timestamp,
      // Additional fields consumed by the dashboard UI
      agentType: l.agentType,
      agentName: AGENT_NAME_MAP[l.agentType?.toLowerCase()] ?? l.agentType,
      message: l.details ?? l.action,
      createdAt: l.timestamp,
    })),
  );
});

export default router;
