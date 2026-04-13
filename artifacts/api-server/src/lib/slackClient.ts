import { requestJsonWithRetry } from "./httpClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string } }
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | { type: "divider" };

type SlackMessage = {
  text: string; // fallback for notifications
  blocks?: SlackBlock[];
  channel?: string; // only used with Bot Token mode
};

type SlackConnectionStatus = {
  ok: boolean;
  mode: "webhook" | "bot_token";
  team?: string;
};

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getWebhookUrl(): string | null {
  const value = process.env.SLACK_WEBHOOK_URL;
  return value && value.trim() ? value.trim() : null;
}

function getBotToken(): string | null {
  const value = process.env.SLACK_BOT_TOKEN;
  return value && value.trim() ? value.trim() : null;
}

function getNotifyChannel(): string {
  return process.env.SLACK_NOTIFY_CHANNEL ?? "#outbound-alerts";
}

// ---------------------------------------------------------------------------
// Core send
// ---------------------------------------------------------------------------

/**
 * Send a Slack message. Prefers Incoming Webhook, falls back to Bot Token.
 * Throws if neither is configured.
 */
export async function sendSlackNotification(message: SlackMessage): Promise<void> {
  const webhookUrl = getWebhookUrl();

  if (webhookUrl) {
    await requestJsonWithRetry<Record<string, unknown>>(
      webhookUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.text, blocks: message.blocks }),
      },
      { retries: 2, timeoutMs: 8000 },
    );
    return;
  }

  const botToken = getBotToken();
  if (!botToken) {
    throw new Error(
      "Slack is not configured. Set SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN.",
    );
  }

  await requestJsonWithRetry<Record<string, unknown>>(
    "https://slack.com/api/chat.postMessage",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({
        channel: message.channel ?? getNotifyChannel(),
        text: message.text,
        ...(message.blocks ? { blocks: message.blocks } : {}),
      }),
    },
    { retries: 2, timeoutMs: 8000 },
  );
}

/**
 * Fire-and-forget wrapper — errors are logged but never propagated.
 * Use this inside pipeline stages so Slack being down never breaks the flow.
 */
export function sendSlackNotificationSilent(message: SlackMessage): void {
  sendSlackNotification(message).catch((error) => {
    // eslint-disable-next-line no-console
    console.warn("[slack] notification failed:", error instanceof Error ? error.message : error);
  });
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export async function testSlackConnection(): Promise<SlackConnectionStatus> {
  const webhookUrl = getWebhookUrl();

  if (webhookUrl) {
    // Incoming Webhooks have no explicit auth test endpoint — send a ping message.
    await requestJsonWithRetry<Record<string, unknown>>(
      webhookUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ":white_check_mark: *AI Revenue Command Center* — Slack connection verified.",
        }),
      },
      { retries: 1, timeoutMs: 8000 },
    );
    return { ok: true, mode: "webhook" };
  }

  const botToken = getBotToken();
  if (!botToken) {
    throw new Error(
      "Slack not configured. Set SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN.",
    );
  }

  const response = await requestJsonWithRetry<{ ok: boolean; team?: string; error?: string }>(
    "https://slack.com/api/auth.test",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({}),
    },
    { retries: 1, timeoutMs: 8000 },
  );

  if (!response.ok) {
    throw new Error(`Slack auth.test failed: ${response.error ?? "unknown error"}`);
  }

  return { ok: true, mode: "bot_token", team: response.team };
}

// ---------------------------------------------------------------------------
// Pre-built notification helpers
// ---------------------------------------------------------------------------

export function notifyPositiveReply(lead: {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
}, campaign: { name: string }): void {
  sendSlackNotificationSilent({
    text: `:tada: Positive reply from *${lead.firstName} ${lead.lastName}* at *${lead.company}*`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🎉 Positive Reply Received" },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Lead:* ${lead.firstName} ${lead.lastName} (${lead.email})\n*Company:* ${lead.company}\n*Campaign:* ${campaign.name}`,
        },
      },
      { type: "divider" },
    ],
  });
}

export function notifyMeetingBooked(lead: {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
}, campaign: { name: string }): void {
  sendSlackNotificationSilent({
    text: `:calendar: Meeting booked with *${lead.firstName} ${lead.lastName}* at *${lead.company}*`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📅 Meeting Booked" },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Lead:* ${lead.firstName} ${lead.lastName} (${lead.email})\n*Company:* ${lead.company}\n*Campaign:* ${campaign.name}`,
        },
      },
      { type: "divider" },
    ],
  });
}

export function notifyCampaignLaunched(campaignName: string, sentCount: number): void {
  sendSlackNotificationSilent({
    text: `:rocket: Campaign *${campaignName}* launched — ${sentCount} emails sent`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🚀 Campaign Launched" },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Campaign:* ${campaignName}\n*Emails sent:* ${sentCount}`,
        },
      },
      { type: "divider" },
    ],
  });
}

export function notifyCampaignCompleted(params: {
  campaignName: string;
  status: "completed" | "paused" | "failed";
  leadsSuccessful: number;
  leadsFailed: number;
  totalCostUsd: number;
  iterations: number;
  errors?: string[];
}): void {
  const { campaignName, status, leadsSuccessful, leadsFailed, totalCostUsd, iterations, errors } = params;

  const icon   = status === "completed" ? "✅" : status === "paused" ? "⚠️" : "❌";
  const label  = status === "completed" ? "Campaign Completed" : status === "paused" ? "Campaign Paused" : "Campaign Failed";
  const emoji  = status === "completed" ? ":white_check_mark:" : status === "paused" ? ":warning:" : ":x:";

  const statsLine = status !== "failed"
    ? `*Sent:* ${leadsSuccessful}  |  *Failed:* ${leadsFailed}  |  *Cost:* $${totalCostUsd.toFixed(2)}  |  *Iterations:* ${iterations}`
    : `*Error:* ${errors?.[0] ?? "Unknown error"}`;

  sendSlackNotificationSilent({
    text: `${emoji} Campaign *${campaignName}* ${status}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${icon} ${label}` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Campaign:* ${campaignName}\n${statsLine}`,
        },
      },
      { type: "divider" },
    ],
  });
}
