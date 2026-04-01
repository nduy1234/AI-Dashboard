import { Router, type IRouter } from "express";
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
  const rawPayload = JSON.stringify(body ?? {});

  if (!verifyProviderWebhookSignature(provider, rawPayload, {
    "x-webhook-signature": req.get("x-webhook-signature") ?? undefined,
    "x-resend-signature": req.get("x-resend-signature") ?? undefined,
    "resend-signature": req.get("resend-signature") ?? undefined,
    "x-instantly-signature": req.get("x-instantly-signature") ?? undefined,
    "x-smartlead-signature": req.get("x-smartlead-signature") ?? undefined,
  })) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const normalized = normalizeSendingEvent(provider, body);

  const result = await processSendingWebhook({
    provider,
    eventId: normalized.eventId,
    eventType: normalized.eventType,
    campaignId: normalized.campaignId,
    leadId: normalized.leadId,
    body: normalized.payload,
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
  const rawPayload = JSON.stringify(body ?? {});

  if (!verifyProviderWebhookSignature(provider, rawPayload, {
    "x-webhook-signature": req.get("x-webhook-signature") ?? undefined,
    "x-resend-signature": req.get("x-resend-signature") ?? undefined,
    "resend-signature": req.get("resend-signature") ?? undefined,
    "x-instantly-signature": req.get("x-instantly-signature") ?? undefined,
    "x-smartlead-signature": req.get("x-smartlead-signature") ?? undefined,
  })) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const result = await processCrmWebhook(provider, body);
  res.status(202).json(result);
});

import { parseCalcomWebhook, validateCalcomWebhook } from "../lib/calcomClient";
import { findRecentCampaignForEmail } from "../repositories/outboundRepository";

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

export default router;
