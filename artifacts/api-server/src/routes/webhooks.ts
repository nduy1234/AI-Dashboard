import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, campaignsTable, sendingEventsTable, analyticsEventsTable } from "@workspace/db";
import { verifyWebhookSignature } from "../lib/outboundIntegrations";

const router: IRouter = Router();

function providerSecret(provider: string): string {
  const envKey = `WEBHOOK_SECRET_${provider.toUpperCase()}`;
  return process.env[envKey] ?? process.env.WEBHOOK_SECRET_DEFAULT ?? "dev-webhook-secret";
}

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

  const [existing] = await db
    .select()
    .from(sendingEventsTable)
    .where(and(eq(sendingEventsTable.provider, provider), eq(sendingEventsTable.eventId, eventId)));
  if (existing) {
    res.json({ ok: true, deduplicated: true });
    return;
  }

  await db.insert(sendingEventsTable).values({
    campaignId,
    leadId,
    provider,
    eventType,
    eventId,
    payload: body,
  });

  if (campaignId && ["open", "reply", "meeting_booked", "bounce"].includes(eventType)) {
    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
    if (campaign) {
      await db
        .update(campaignsTable)
        .set({
          openCount: eventType === "open" ? campaign.openCount + 1 : campaign.openCount,
          replyCount: eventType === "reply" ? campaign.replyCount + 1 : campaign.replyCount,
          meetingsBooked: eventType === "meeting_booked" ? campaign.meetingsBooked + 1 : campaign.meetingsBooked,
          sentCount: eventType === "sent" ? campaign.sentCount + 1 : campaign.sentCount,
        })
        .where(eq(campaignsTable.id, campaignId));
    }
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

  await db.insert(analyticsEventsTable).values({
    userId: "system",
    orgId: null,
    eventType: "crm_webhook_received",
    entityType: "crm_event",
    metadata: { provider, body },
  });

  res.status(202).json({ ok: true });
});

export default router;
