import { Router, type IRouter } from "express";
import Stripe from "stripe";
import {
  handleCheckoutSessionCompleted,
  handleSubscriptionUpdated,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from "../services/billingService";
import {
  normalizeSendingEvent,
  verifyProviderWebhookSignature,
} from "../lib/outboundIntegrations";
import {
  processCrmWebhook,
  processSendingWebhook,
} from "../services/webhookService";

const router: IRouter = Router();

router.post("/webhooks/sending/:provider", async (req, res): Promise<void> => {
  const provider = req.params.provider;
  const body = req.body as Record<string, unknown>;

  // Use the raw body captured in app.ts for Svix-based providers (Resend).
  // Fall back to re-serialised JSON for HMAC-based providers (Instantly, Smartlead).
  const rawPayload = (req as any).rawBody ?? JSON.stringify(body ?? {});

  if (!verifyProviderWebhookSignature(provider, rawPayload, {
    // Resend (Svix) headers
    "svix-id":        req.get("svix-id") ?? undefined,
    "svix-timestamp": req.get("svix-timestamp") ?? undefined,
    "svix-signature": req.get("svix-signature") ?? undefined,
    // Instantly / Smartlead HMAC headers
    "x-instantly-signature": req.get("x-instantly-signature") ?? undefined,
    "x-smartlead-signature":  req.get("x-smartlead-signature") ?? undefined,
    "x-webhook-signature":    req.get("x-webhook-signature") ?? undefined,
  })) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const normalized = normalizeSendingEvent(provider, body);

  // Resend webhooks never include internal campaign/lead IDs — resolve them by
  // checking three sources in priority order.
  // Resend nests all fields under `data`: { type, data: { to, from, email_id, … } }
  let { campaignId, leadId } = normalized;
  if (campaignId === null && provider === "resend") {
    const data = (body.data ?? {}) as Record<string, unknown>;

    // 1. Most precise: look up by the Resend email_id stored in outbound_messages
    const resendEmailId = typeof data.email_id === "string" ? data.email_id : null;
    if (resendEmailId) {
      const idMatch = await findCampaignByExternalMessageId(resendEmailId);
      if (idMatch) {
        campaignId = idMatch.campaignId;
        leadId     = idMatch.leadId;
        console.log(`[Webhook/Sending/Resend] resolved via email_id=${resendEmailId}  campaignId=${campaignId}  leadId=${leadId}`);
      }
    }

    // 2. Fallback: look up by recipient email in outbound_messages / campaign_leads
    if (campaignId === null) {
      const toField = data.to;
      const recipientEmail: string | null =
        Array.isArray(toField) && typeof toField[0] === "string"
          ? toField[0]
          : typeof toField === "string"
            ? toField
            : null;

      if (recipientEmail) {
        const emailMatch = await findCampaignByRecipientEmail(recipientEmail);
        if (emailMatch) {
          campaignId = emailMatch.campaignId;
          leadId     = emailMatch.leadId;
          console.log(`[Webhook/Sending/Resend] resolved via recipient=${recipientEmail}  campaignId=${campaignId}  leadId=${leadId}`);
        } else {
          // 3. Last resort: when TEST_EMAIL_OVERRIDE redirects all sends to one inbox,
          //    the recipient doesn't match any lead — fall back to most recently sent message
          const testOverride = process.env.TEST_EMAIL_OVERRIDE;
          if (testOverride && recipientEmail.toLowerCase() === testOverride.toLowerCase()) {
            const fallback = await findMostRecentSentMessage();
            if (fallback) {
              campaignId = fallback.campaignId;
              leadId     = fallback.leadId;
              console.log(`[Webhook/Sending/Resend] TEST_EMAIL_OVERRIDE fallback  campaignId=${campaignId}  leadId=${leadId}`);
            } else {
              console.warn(`[Webhook/Sending/Resend] ⚠ TEST_EMAIL_OVERRIDE active but no sent messages found`);
            }
          } else {
            console.warn(`[Webhook/Sending/Resend] ⚠ no campaign match for recipient ${recipientEmail}`);
          }
        }
      }
    }
  }

  const result = await processSendingWebhook({
    provider,
    eventId: normalized.eventId,
    eventType: normalized.eventType,
    campaignId,
    leadId,
    body: normalized.payload,
    replyFromEmail: normalized.replyFromEmail,
    replySubject: normalized.replySubject,
    replyText: normalized.replyText,
    replyHtml: normalized.replyHtml,
  });
  if (result.deduplicated) {
    res.json(result);
    return;
  }
  res.status(202).json({ ok: true });
});

router.post("/webhooks/crm/:provider", async (req, res): Promise<void> => {
  const provider = req.params.provider;
  const body = req.body as Record<string, unknown>;
  const rawPayload = (req as any).rawBody ?? JSON.stringify(body ?? {});

  if (!verifyProviderWebhookSignature(provider, rawPayload, {
    "svix-id":        req.get("svix-id") ?? undefined,
    "svix-timestamp": req.get("svix-timestamp") ?? undefined,
    "svix-signature": req.get("svix-signature") ?? undefined,
    "x-instantly-signature": req.get("x-instantly-signature") ?? undefined,
    "x-smartlead-signature":  req.get("x-smartlead-signature") ?? undefined,
    "x-webhook-signature":    req.get("x-webhook-signature") ?? undefined,
  })) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const result = await processCrmWebhook(provider, body);
  res.status(202).json(result);
});

import { parseCalcomWebhook, validateCalcomWebhook } from "../lib/calcomClient";
import { findCampaignByExternalMessageId, findCampaignByRecipientEmail, findRecentCampaignForEmail, findMostRecentSentMessage } from "../repositories/outboundRepository";
import { fetchResendEmailContent } from "../lib/outboundIntegrations";

router.post("/webhooks/calcom", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const rawPayload = JSON.stringify(body ?? {});
  const signature = req.get("X-Cal-Signature-256");

  if (!signature || !validateCalcomWebhook(signature, rawPayload)) {
    res.status(401).json({ error: "Invalid Cal.com webhook signature" });
    return;
  }

  // Cal.com sends a PING event when setting up the webhook
  if (body.triggerEvent === "PING" || body.triggerEvent === "ping") {
    res.status(202).json({ ok: true, note: "Ping received" });
    return;
  }

  const { email, bookingId } = parseCalcomWebhook(body);
  if (!email || !bookingId) {
    res.status(400).json({ error: "Missing email or booking ID in payload", debug: body });
    return;
  }

  const match = await findRecentCampaignForEmail(email);
  if (!match) {
    // If we can't find a matching outbound campaign lead, we just log it as a CRM webhooks
    await processCrmWebhook("calcom", body);
    res.status(202).json({ ok: true, note: "Unmatched to outbound campaign" });
    return;
  }

  const result = await processSendingWebhook({
    provider: "calcom",
    eventId: bookingId,
    eventType: "meeting_booked",
    campaignId: match.campaignId,
    leadId: match.leadId,
    body,
  });

  res.status(202).json(result);
});

/**
 * POST /webhooks/inbound/resend
 *
 * Handles the `email.received` event Resend posts when a prospect replies to
 * one of our outbound emails via a Resend-managed receiving domain.
 *
 * HOW RESEND INBOUND WORKS (per docs):
 *   1. The webhook payload contains ONLY metadata — no body, no text, no html.
 *      Fields: { type:"email.received", data:{ email_id, from, to, subject,
 *                                              message_id, attachments[] } }
 *   2. After receiving the webhook we call GET /emails/receiving/:email_id
 *      to fetch the actual html/text body.
 *   3. Signature uses Svix (headers: svix-id, svix-timestamp, svix-signature).
 *      Secret = WEBHOOK_SECRET_RESEND_INBOUND from your Resend Webhooks page.
 *      NOTE: this is a DIFFERENT secret from WEBHOOK_SECRET_RESEND (sending events).
 *            Each webhook registration in Resend generates its own unique secret.
 *
 * SETUP (Resend dashboard):
 *   Webhooks → Add Webhook → URL: https://your-api/webhooks/inbound/resend
 *   Event: email.received
 *   Copy the signing secret shown → WEBHOOK_SECRET_RESEND_INBOUND env var
 */
router.post("/webhooks/inbound/resend", async (req, res): Promise<void> => {
  // Resend requires the raw request body for Svix signature verification.
  const rawPayload = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
  const body = req.body as Record<string, unknown>;

  console.log(`[Webhook/Inbound/Resend] ← hit  type=${body.type ?? "unknown"}  svix-id=${req.get("svix-id") ?? "none"}`);

  // Uses WEBHOOK_SECRET_RESEND_INBOUND (separate from sending-events secret)
  if (!verifyProviderWebhookSignature("resend_inbound", rawPayload, {
    "svix-id":        req.get("svix-id") ?? undefined,
    "svix-timestamp": req.get("svix-timestamp") ?? undefined,
    "svix-signature": req.get("svix-signature") ?? undefined,
  })) {
    console.warn(`[Webhook/Inbound/Resend] ✗ signature invalid — check WEBHOOK_SECRET_RESEND_INBOUND`);
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  // Only handle email.received — Resend may send other event types on the same webhook
  if (body.type !== "email.received") {
    console.log(`[Webhook/Inbound/Resend] ignoring event type: ${body.type}`);
    res.status(202).json({ ok: true, note: `Event type '${body.type}' ignored` });
    return;
  }

  const data = (body.data ?? {}) as Record<string, unknown>;

  const emailId   = typeof data.email_id   === "string" ? data.email_id   : null;
  const messageId = typeof data.message_id === "string" ? data.message_id : null;
  const rawFrom   = typeof data.from === "string" ? data.from : null;
  const subject   = typeof data.subject === "string" ? data.subject : null;

  console.log(`[Webhook/Inbound/Resend] email.received  email_id=${emailId}  from=${rawFrom}  subject="${subject}"`);

  if (!emailId) {
    console.warn(`[Webhook/Inbound/Resend] ✗ missing email_id in payload`);
    res.status(400).json({ error: "Missing email_id in webhook data" });
    return;
  }

  // Strip display-name format "Jane <jane@example.com>" → "jane@example.com"
  const senderAddress = rawFrom
    ? (rawFrom.includes("<") ? (rawFrom.match(/<([^>]+)>/)?.[1] ?? rawFrom).trim() : rawFrom.trim())
    : null;

  // Fetch the actual email body from Resend (webhooks contain metadata only)
  console.log(`[Webhook/Inbound/Resend] fetching email content for ${emailId}…`);
  const emailContent = await fetchResendEmailContent(emailId);
  console.log(`[Webhook/Inbound/Resend] content fetched  hasText=${!!emailContent?.text}  hasHtml=${!!emailContent?.html}`);

  // Resolve campaign/lead via DB lookup using sender address
  let campaignId: number | null = null;
  let leadId: number | null = null;
  if (senderAddress) {
    const match = await findRecentCampaignForEmail(senderAddress);
    if (match) {
      campaignId = match.campaignId;
      leadId     = match.leadId;
      console.log(`[Webhook/Inbound/Resend] matched  campaignId=${campaignId}  leadId=${leadId}`);
    } else {
      // TEST_EMAIL_OVERRIDE redirects all sends to one address — the reply will
      // come from that same address, so no lead email matches.  Fall back to the
      // most recently sent message so stats are still attributed correctly.
      const testOverride = process.env.TEST_EMAIL_OVERRIDE;
      if (testOverride && senderAddress.toLowerCase() === testOverride.toLowerCase()) {
        const fallback = await findMostRecentSentMessage();
        if (fallback) {
          campaignId = fallback.campaignId;
          leadId     = fallback.leadId;
          console.log(`[Webhook/Inbound/Resend] TEST_EMAIL_OVERRIDE fallback  campaignId=${campaignId}  leadId=${leadId}`);
        } else {
          console.warn(`[Webhook/Inbound/Resend] ⚠ TEST_EMAIL_OVERRIDE active but no sent messages found`);
        }
      } else {
        console.warn(`[Webhook/Inbound/Resend] ⚠ no outbound campaign match for sender ${senderAddress}`);
      }
    }
  }

  const eventId = `inbound:resend:${emailId}`;

  const result = await processSendingWebhook({
    provider: "resend",
    eventId,
    eventType: "reply",
    campaignId,
    leadId,
    body: data,
    replyFromEmail: senderAddress ?? undefined,
    replySubject:   subject ?? undefined,
    replyText:      emailContent?.text ?? undefined,
    replyHtml:      emailContent?.html ?? undefined,
    resendEmailId:  emailId,
    messageId:      messageId ?? undefined,
  });

  console.log(`[Webhook/Inbound/Resend] ✓ stored  deduplicated=${result.deduplicated}  emailId=${emailId}`);
  res.status(202).json(result);
});

/**
 * POST /webhooks/inbound/:provider
 *
 * Handles inbound reply webhooks from Instantly and Smartlead.
 * Unlike Resend, these providers include the full reply body in the webhook payload.
 *
 * Instantly  payload: { event:"reply", from_email, reply_text, subject, campaign_id, lead_id }
 * Smartlead  payload: { event_type:"EMAIL_REPLY", from_email, reply_message_body, subject, campaign_id, lead_id }
 *
 * Signature: HMAC-SHA256 via WEBHOOK_SECRET_INSTANTLY / WEBHOOK_SECRET_SMARTLEAD env vars.
 * Configure the reply webhook URL in each provider's dashboard to:
 *   https://your-api/webhooks/inbound/instantly
 *   https://your-api/webhooks/inbound/smartlead
 */
router.post("/webhooks/inbound/:provider", async (req, res): Promise<void> => {
  const provider = req.params.provider;

  // Resend has its own dedicated route above
  if (provider === "resend") {
    res.status(404).json({ error: "Use /webhooks/inbound/resend" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const rawPayload = JSON.stringify(body ?? {});

  if (!verifyProviderWebhookSignature(provider, rawPayload, {
    "x-instantly-signature": req.get("x-instantly-signature") ?? undefined,
    "x-smartlead-signature":  req.get("x-smartlead-signature") ?? undefined,
    "x-webhook-signature":    req.get("x-webhook-signature") ?? undefined,
  })) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  // Extract sender email — field names differ between providers
  const rawFrom =
    typeof body.from_email === "string" ? body.from_email :
    typeof body.from       === "string" ? body.from       :
    typeof body.fromEmail  === "string" ? body.fromEmail  : null;

  if (!rawFrom) {
    res.status(400).json({ error: "Missing sender email in payload" });
    return;
  }

  const senderAddress = rawFrom.includes("<")
    ? (rawFrom.match(/<([^>]+)>/)?.[1] ?? rawFrom).trim()
    : rawFrom.trim();

  const subject  =
    typeof body.subject       === "string" ? body.subject       :
    typeof body.email_subject === "string" ? body.email_subject : null;

  const replyText =
    typeof body.reply_text         === "string" ? body.reply_text         :
    typeof body.reply_message_body === "string" ? body.reply_message_body :
    typeof body.text               === "string" ? body.text               :
    typeof body.body               === "string" ? body.body               : null;

  const replyHtml =
    typeof body.reply_html === "string" ? body.reply_html :
    typeof body.html       === "string" ? body.html       : null;

  // Providers may include campaign/lead IDs directly
  const directCampaignId =
    typeof body.campaign_id === "number" ? body.campaign_id :
    typeof body.campaignId  === "number" ? body.campaignId  : null;
  const directLeadId =
    typeof body.lead_id === "number" ? body.lead_id :
    typeof body.leadId  === "number" ? body.leadId  : null;

  let campaignId: number | null = directCampaignId;
  let leadId: number | null     = directLeadId;

  if (campaignId === null || leadId === null) {
    const match = await findRecentCampaignForEmail(senderAddress);
    if (match) {
      campaignId = campaignId ?? match.campaignId;
      leadId     = leadId     ?? match.leadId;
    }
  }

  const isPositive = String(body.sentiment ?? body.category ?? "").toLowerCase().includes("positive");
  const eventId = `inbound:${provider}:${senderAddress}:${Date.now()}`;

  const result = await processSendingWebhook({
    provider,
    eventId,
    eventType: isPositive ? "positive_reply" : "reply",
    campaignId,
    leadId,
    body,
    replyFromEmail: senderAddress,
    replySubject:   subject ?? undefined,
    replyText:      replyText ?? undefined,
    replyHtml:      replyHtml ?? undefined,
  });

  res.status(202).json(result);
});

// ---------------------------------------------------------------------------
// Stripe Webhook
// POST /webhooks/stripe
//
// Stripe signs every event with STRIPE_WEBHOOK_SECRET (whsec_...).
// The raw body captured in app.ts is used for signature verification.
// Events handled:
//   checkout.session.completed      → create subscription record, anti-abuse check
//   customer.subscription.updated   → keep status in sync (trial→active/past_due)
//   invoice.payment_succeeded       → confirm active status after trial conversion
//   invoice.payment_failed          → mark past_due, front-end restricts features
// ---------------------------------------------------------------------------
router.post("/webhooks/stripe", async (req, res): Promise<void> => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Billing/Webhook] STRIPE_WEBHOOK_SECRET is not set");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  const signature = req.get("stripe-signature");
  if (!signature) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  const rawBody = (req as unknown as { rawBody?: string }).rawBody;
  if (!rawBody) {
    res.status(400).json({ error: "Raw body unavailable" });
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    console.warn("[Billing/Webhook] Signature verification failed:", msg);
    res.status(400).json({ error: msg });
    return;
  }

  console.log(`[Billing/Webhook] ← ${event.type}  id=${event.id}`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.created":
        await handleSubscriptionUpdated(event);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`[Billing/Webhook] Error processing ${event.type}:`, err);
    // Return 500 so Stripe retries the event
    res.status(500).json({ error: "Internal processing error" });
    return;
  }

  res.json({ received: true });
});

export default router;
