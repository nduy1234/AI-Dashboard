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

export default router;
