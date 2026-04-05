import { db } from "../repositories/outboundRepository";
import {
  applyCampaignEventDelta,
  createAnalyticsEvent,
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
}) {
  const existing = await findSendingEvent(payload.provider, payload.eventId);
  if (existing) {
    return { ok: true, deduplicated: true };
  }

  await db.transaction(async (tx: any) => {
    await createSendingEvent({
      campaignId: payload.campaignId,
      leadId: payload.leadId,
      provider: payload.provider,
      eventType: payload.eventType,
      eventId: payload.eventId,
      payload: payload.body,
    }, tx);

    if (payload.campaignId && ["open", "reply", "meeting_booked", "bounce", "sent"].includes(payload.eventType)) {
      await applyCampaignEventDelta(payload.campaignId, payload.eventType, tx);
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
      const mod = await import("../../../lib/agent-orchestration/dist/index.js" as any);
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
