import { Router, type IRouter } from "express";
import { verifyWebhookSignature } from "../lib/outboundIntegrations";
import {
  processCrmWebhook,
  processSendingWebhook,
  providerSecret,
} from "../services/webhookService";

const router: IRouter = Router();

router.post("/webhooks/sending/:provider", async (req, res): Promise<void> => {
  const provider = req.params.provider;
  const signature = req.get("x-webhook-signature");
  const body = req.body as Record<string, unknown>;
  const rawPayload = JSON.stringify(body ?? {});

  if (!verifyWebhookSignature(rawPayload, signature, providerSecret(provider))) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : `${provider}:${Date.now()}`;
  const eventType = typeof body.eventType === "string" ? body.eventType : "unknown";
  const campaignId = typeof body.campaignId === "number" ? body.campaignId : null;
  const leadId = typeof body.leadId === "number" ? body.leadId : null;

  const result = await processSendingWebhook({
    provider,
    eventId,
    eventType,
    campaignId,
    leadId,
    body,
  });
  if (result.deduplicated) {
    res.json(result);
    return;
  }
  res.status(202).json({ ok: true });
});

router.post("/webhooks/crm/:provider", async (req, res): Promise<void> => {
  const provider = req.params.provider;
  const signature = req.get("x-webhook-signature");
  const body = req.body as Record<string, unknown>;
  const rawPayload = JSON.stringify(body ?? {});

  if (!verifyWebhookSignature(rawPayload, signature, providerSecret(provider))) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const result = await processCrmWebhook(provider, body);
  res.status(202).json(result);
});

export default router;
