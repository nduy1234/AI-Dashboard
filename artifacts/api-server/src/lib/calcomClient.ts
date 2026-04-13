import { createHmac } from "crypto";
import { requestJsonWithRetry } from "./httpClient";

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getApiKey(): string | null {
  const value = process.env.CALCOM_API_KEY;
  return value && value.trim() ? value.trim() : null;
}

function getWebhookSecret(): string | null {
  const value = process.env.CALCOM_WEBHOOK_SECRET;
  return value && value.trim() ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Webhook validation
// ---------------------------------------------------------------------------

/**
 * Validates the Cal.com webhook signature.
 * Cal.com signs the raw payload string using the webhook secret.
 */
export function validateCalcomWebhook(signature: string, rawPayload: string): boolean {
  const secret = getWebhookSecret();
  if (!secret) {
    // eslint-disable-next-line no-console
    console.warn("[calcom] Missing CALCOM_WEBHOOK_SECRET");
    return false;
  }
  
  if (!signature) return false;

  const expectedSignature = createHmac("sha256", secret).update(rawPayload, "utf8").digest("hex");
  return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
}

export function parseCalcomWebhook(body: Record<string, unknown>): { email: string | null; bookingId: string | null } {
  // Cal.com webhook payload format for BOOKING_CREATED:
  // { payload: { uid: "...", attendees: [ { email: "...", name: "..." } ], ... }, ... }
  const payload = body.payload as Record<string, unknown> | undefined;
  
  let bookingId: string | null = null;
  if (payload && typeof payload.uid === "string") {
    bookingId = payload.uid;
  }

  let email: string | null = null;
  if (payload && Array.isArray(payload.attendees) && payload.attendees.length > 0) {
    // Assuming the first attendee is the prospect
    const firstAttendee = payload.attendees[0] as Record<string, unknown>;
    if (typeof firstAttendee.email === "string") {
      email = firstAttendee.email;
    }
  }

  return { email, bookingId };
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export async function testCalcomConnection(): Promise<{ ok: boolean }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Cal.com is not configured. Set CALCOM_API_KEY.");
  }

  // Use the Cal.com v2 API to fetch event types as a token check
  // See: https://cal.com/docs/enterprise-features/api/api-reference/v2/event-types/get-all-event-types
  const response = await requestJsonWithRetry<{ status?: string; message?: string; data?: unknown }>(
    "https://api.cal.com/v2/event-types",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "cal-api-version": "2024-08-13",
      },
    },
    { retries: 1, timeoutMs: 8000 },
  );

  // If the API returns a status, verify it's success. 
  if (response.status === "error") {
    throw new Error(`Cal.com auth test failed: ${response.message ?? "Unknown error"}`);
  }

  return { ok: true };
}
