import { db } from "../repositories/outboundRepository";
import {
  applyCampaignEventDelta,
  createAnalyticsEvent,
  createSendingEvent,
  findSendingEvent,
} from "../repositories/outboundRepository";

export function providerSecret(provider: string): string {
  const envKey = `WEBHOOK_SECRET_${provider.toUpperCase()}`;
  return process.env[envKey] ?? process.env.WEBHOOK_SECRET_DEFAULT ?? "dev-webhook-secret";
}

export async function processSendingWebhook(payload: {
  provider: string;
  eventId: string;
  eventType: string;
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
