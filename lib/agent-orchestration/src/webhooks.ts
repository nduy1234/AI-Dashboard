/**
 * Webhook Signal Handlers
 * Convert webhook events from email/calendar providers into campaign signals
 * Used to populate campaign_signals table for agent learning loop
 */

import { recordCampaignSignal } from "./repository.js";

/**
 * Handle Resend webhook
 * Events: email.delivered, email.bounced, email.complained, email.opened, email.clicked
 * https://resend.com/docs/webhooks
 */
export async function handleResendWebhook(event: any): Promise<void> {
  const { type, data } = event;

  // Map Resend event types to our signal types
  const signalTypeMap: Record<string, string> = {
    "email.opened": "open",
    "email.clicked": "click",
    "email.bounced": "bounce",
    "email.complained": "unsubscribe",
  };

  const signalType = signalTypeMap[type];
  if (!signalType) return; // Ignore unsupported event types

  const { email, headers } = data;
  const campaignId = headers?.["x-campaign-id"] as number | undefined;
  const leadId = headers?.["x-lead-id"] as number | undefined;

  if (!campaignId) {
    console.warn("[Webhook] Resend event missing x-campaign-id, skipping");
    return;
  }

  await recordCampaignSignal(campaignId, leadId, signalType as any, data.id, {
    provider: "resend",
    email,
    timestamp: data.created_at,
  });

  console.log(`[Webhook] Resend: Recorded ${signalType} for campaign ${campaignId}`);
}

/**
 * Handle Instantly webhook
 * Events: campaign_email_opened, campaign_email_clicked, campaign_email_replied, campaign_email_bounced
 * https://instantly.ai/developers/api
 */
export async function handleInstantlyWebhook(event: any): Promise<void> {
  const { event: eventType, data } = event;

  // Map Instantly event types to our signal types
  const signalTypeMap: Record<string, string> = {
    campaign_email_opened: "open",
    campaign_email_clicked: "click",
    campaign_email_replied: "reply",
    campaign_email_bounced: "bounce",
  };

  const signalType = signalTypeMap[eventType];
  if (!signalType) return; // Ignore unsupported event types

  const { email, campaign_id, lead_id } = data;
  const campaignId = campaign_id as number;
  const leadId = lead_id as number | undefined;

  if (!campaignId) {
    console.warn("[Webhook] Instantly event missing campaign_id, skipping");
    return;
  }

  await recordCampaignSignal(campaignId, leadId, signalType as any, data.id, {
    provider: "instantly",
    email,
    timestamp: new Date().toISOString(),
  });

  console.log(`[Webhook] Instantly: Recorded ${signalType} for campaign ${campaignId}`);
}

/**
 * Handle Cal.com webhook
 * Events: BOOKING_CREATED, BOOKING_CONFIRMED, BOOKING_RESCHEDULED, BOOKING_CANCELLED
 * https://cal.com/docs/webhooks
 */
export async function handleCalcomWebhook(event: any): Promise<void> {
  const { triggerEvent, data } = event;

  // Only care about booking creation for now
  if (triggerEvent !== "BOOKING_CREATED") return;

  const { attendees, organizer, title } = data;
  if (!attendees || attendees.length === 0) return;

  const attendeeEmail = attendees[0]?.email;
  if (!attendeeEmail) return;

  // Try to extract campaign/lead ID from booking title or notes
  let campaignId: number | undefined;
  let leadId: number | undefined;

  if (title?.includes("campaign_")) {
    const match = title.match(/campaign_(\d+)_lead_(\d+)/);
    if (match) {
      campaignId = parseInt(match[1], 10);
      leadId = parseInt(match[2], 10);
    }
  }

  if (!campaignId) {
    console.warn("[Webhook] Cal.com booking missing campaign ID in title, skipping");
    return;
  }

  // Map booking to "positive_reply" signal (they booked!)
  await recordCampaignSignal(campaignId, leadId, "positive_reply", data.uid, {
    provider: "calcom",
    email: attendeeEmail,
    bookingTitle: title,
    timestamp: data.startTime,
  });

  console.log(`[Webhook] Cal.com: Recorded positive_reply (booking) for campaign ${campaignId}`);
}

/**
 * Route webhook to appropriate handler based on provider
 */
export async function handleProviderWebhook(provider: string, event: any): Promise<void> {
  try {
    switch (provider) {
      case "resend":
        await handleResendWebhook(event);
        break;
      case "instantly":
        await handleInstantlyWebhook(event);
        break;
      case "calcom":
      case "cal.com":
        await handleCalcomWebhook(event);
        break;
      default:
        console.warn(`[Webhook] Unknown provider: ${provider}`);
    }
  } catch (error) {
    console.error(`[Webhook] Error handling ${provider} event:`, error);
  }
}

/**
 * Compute KPI aggregates from recorded signals
 * Called by agent's review_signals action
 */
export function computeSignalKpis(signals: Array<{ signal_type: string }>): {
  openRate: number;
  replyRate: number;
  positiveReplyRate: number;
  bounceRate: number;
} {
  if (signals.length === 0) {
    return {
      openRate: 0,
      replyRate: 0,
      positiveReplyRate: 0,
      bounceRate: 0,
    };
  }

  const counts = {
    open: signals.filter((s) => s.signal_type === "open").length,
    reply: signals.filter((s) => s.signal_type === "reply").length,
    positive_reply: signals.filter((s) => s.signal_type === "positive_reply").length,
    bounce: signals.filter((s) => s.signal_type === "bounce").length,
  };

  const total = signals.length;

  return {
    openRate: counts.open / total,
    replyRate: counts.reply / total,
    positiveReplyRate: counts.positive_reply / total,
    bounceRate: counts.bounce / total,
  };
}
