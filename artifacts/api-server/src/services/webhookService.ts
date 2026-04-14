import { eq } from "drizzle-orm";
import { db, leadsTable, campaignsTable } from "@workspace/db";
import {
  applyCampaignEventDelta,
  createAnalyticsEvent,
  createEmailReply,
  createSendingEvent,
  findSendingEvent,
  getOwnedCampaignById,
  listOwnedLeadsByIds,
} from "../repositories/outboundRepository";
import { notifyMeetingBooked, notifyPositiveReply } from "../lib/slackClient";

export function providerSecret(provider: string): string {
  const envKey = `WEBHOOK_SECRET_${provider.toUpperCase()}`;
  return process.env[envKey] ?? process.env.WEBHOOK_SECRET_DEFAULT ?? "dev-webhook-secret";
}

export async function processSendingWebhook(payload: {
  provider: string;
  eventId: string;
  eventType: "sent" | "open" | "reply" | "positive_reply" | "bounce" | "meeting_booked" | "unknown";
  campaignId: number | null;
  leadId: number | null;
  body: Record<string, unknown>;
  /** Parsed reply content — supply for reply / positive_reply events */
  replyFromEmail?: string;
  replySubject?: string;
  replyText?: string;
  replyHtml?: string;
  /** Resend-specific: email_id from the webhook data, used to fetch body content */
  resendEmailId?: string;
  /** Raw Message-ID header for reply threading (In-Reply-To) */
  messageId?: string;
}) {
  const existing = await findSendingEvent(payload.provider, payload.eventId);
  if (existing) {
    return { ok: true, deduplicated: true };
  }

  let sendingEventId: number | undefined;

  await db.transaction(async (tx: any) => {
    const sendingEvent = await createSendingEvent({
      campaignId: payload.campaignId,
      leadId: payload.leadId,
      provider: payload.provider,
      eventType: payload.eventType,
      eventId: payload.eventId,
      payload: payload.body,
    }, tx);
    sendingEventId = sendingEvent?.id;

    if (payload.campaignId && ["open", "reply", "meeting_booked", "bounce", "sent"].includes(payload.eventType)) {
      await applyCampaignEventDelta(payload.campaignId, payload.eventType, tx);
    }

    // Persist reply content so it can be surfaced in the dashboard
    if (payload.eventType === "reply" || payload.eventType === "positive_reply") {
      await createEmailReply({
        campaignId: payload.campaignId,
        leadId: payload.leadId,
        sendingEventId: sendingEvent?.id ?? null,
        provider: payload.provider,
        fromEmail: payload.replyFromEmail ?? null,
        subject: payload.replySubject ?? null,
        textBody: payload.replyText ?? null,
        htmlBody: payload.replyHtml ?? null,
        resendEmailId: payload.resendEmailId ?? null,
        messageId: payload.messageId ?? null,
        sentiment: payload.eventType === "positive_reply" ? "positive" : "unknown",
      }, tx);
    }
  });

  // Record signal to campaign_signals table for agent learning loop
  try {
    // Convert the webhook event to agent webhook format
    const agentWebhookEvent = {
      type: payload.eventType,
      data: {
        ...payload.body,
        id: payload.eventId,
      },
      headers: {
        "x-campaign-id": payload.campaignId,
        "x-lead-id": payload.leadId,
      },
    };
    
    // Call agent webhook handler to record signal (lazy import to avoid blocking if package not built yet)
    try {
      const mod = await import("../../../../lib/agent-orchestration/dist/index.js" as any);
      if (mod.handleProviderWebhook) {
        await mod.handleProviderWebhook(payload.provider, agentWebhookEvent);
        console.log(`[WebhookService] Recorded signal for agent learning: ${payload.eventType} from ${payload.provider}`);
      }
    } catch (importErr) {
      // Agent orchestration not available, just log and continue
      console.warn(`[WebhookService] Agent orchestration not available for signal recording (${importErr instanceof Error ? importErr.message : String(importErr)})`);
    }
  } catch (error) {
    console.warn(`[WebhookService] Failed to record signal for agent learning:`, error instanceof Error ? error.message : error);
    // Don't block webhook processing if agent signal recording fails
  }

  // ── Attribution: update lead status for reactivation campaigns ─────────────
  // This drives the Dormant → Re-engaged → Meeting Booked funnel in real-time.
  if (payload.leadId && payload.campaignId) {
    const isReplyEvent = payload.eventType === "reply" || payload.eventType === "positive_reply";
    const isMeetingEvent = payload.eventType === "meeting_booked";

    if (isReplyEvent || isMeetingEvent) {
      try {
        // Only update if this lead belongs to a reactivation campaign
        const [campaign] = await db
          .select({ type: campaignsTable.type })
          .from(campaignsTable)
          .where(eq(campaignsTable.id, payload.campaignId));

        if (campaign?.type === "reactivation") {
          const newStatus = isMeetingEvent ? "meeting_booked" : "replied";
          await db
            .update(leadsTable)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(leadsTable.id, payload.leadId));

          console.log(`[WebhookService] Attribution: lead ${payload.leadId} → ${newStatus} (reactivation campaign ${payload.campaignId})`);
        }
      } catch (attrErr) {
        console.warn("[WebhookService] Attribution update failed:", attrErr instanceof Error ? attrErr.message : attrErr);
      }
    }
  }

  // Fire Slack notifications for high-value events (non-blocking)
  if (payload.leadId && payload.campaignId) {
    if (payload.eventType === "positive_reply" || payload.eventType === "meeting_booked") {
      const leads = await listOwnedLeadsByIds([payload.leadId], { userId: "system", orgId: null }).catch(() => []);
      const campaign = await getOwnedCampaignById(payload.campaignId, { userId: "system", orgId: null }).catch(() => null);
      const lead = leads[0];
      if (lead && campaign) {
        if (payload.eventType === "positive_reply") {
          notifyPositiveReply(lead, campaign);
        } else {
          notifyMeetingBooked(lead, campaign);
        }
      }
    }
  }

  return { ok: true, deduplicated: false };
}

export async function processCrmWebhook(provider: string, body: Record<string, unknown>) {
  await createAnalyticsEvent({
    userId: "system",
    orgId: null,
    eventType: "crm_webhook_received",
    entityType: "crm_event",
    metadata: { provider, body },
  });
  return { ok: true };
}
