import { createHmac, randomUUID } from "node:crypto";
import { requestJsonWithRetry, toJsonBody } from "./httpClient";
import { isOutboundProviderEnabled } from "./outboundConfig";

export type EnrichedLead = {
  industry?: string;
  companySize?: string;
  linkedinUrl?: string;
  recentNews?: string;
};

export type VerificationResult = {
  result: "valid" | "invalid" | "risky";
  reason: string;
};

export type PersonalizedMessage = {
  subject: string;
  body: string;
};

export interface OutboundProviderAdapter {
  importLeads?(payload: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  enrichLead?(lead: { email: string; company: string; title: string }): Promise<EnrichedLead>;
  verifyEmail?(email: string): Promise<VerificationResult>;
  sendMessage?(payload: {
    to: string;
    subject: string;
    body: string;
    fromDomain?: string | null;
  }): Promise<{ externalMessageId: string }>;
}

export type InstantlyLaunchLead = {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
};

type InstantlyEndpointMap = {
  createCampaign: string;
  addLeads: string;
  activateCampaignTemplate: string;
};

function parseJsonEnv(name: string): Record<string, unknown> {
  const value = process.env[name];
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function resolveEndpoint(baseUrl: string, endpointOrUrl: string): string {
  if (/^https?:\/\//i.test(endpointOrUrl)) return endpointOrUrl;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = endpointOrUrl.startsWith("/") ? endpointOrUrl : `/${endpointOrUrl}`;
  return `${normalizedBase}${normalizedPath}`;
}

function scoreEmailQuality(email: string): VerificationResult {
  const domain = email.split("@")[1] ?? "";
  if (!domain || domain.includes("example")) {
    return { result: "invalid", reason: "Domain is not routable" };
  }
  if (email.startsWith("info@") || email.startsWith("support@")) {
    return { result: "risky", reason: "Generic role mailbox" };
  }
  return { result: "valid", reason: "Heuristic validation passed" };
}

class ApolloAdapter implements OutboundProviderAdapter {
  async importLeads(payload: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
    const csvLeads = payload.leads;
    if (Array.isArray(csvLeads)) {
      return csvLeads.filter((lead): lead is Record<string, unknown> => !!lead && typeof lead === "object");
    }

    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) return [];

    const baseUrl = process.env.APOLLO_BASE_URL ?? "https://api.apollo.io";
    const endpoint = process.env.APOLLO_IMPORT_ENDPOINT ?? "/v1/mixed_people/search";
    const response = await requestJsonWithRetry<{ people?: Array<Record<string, unknown>> }>(
      `${baseUrl}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: toJsonBody({
          page: 1,
          per_page: 25,
          ...((payload.filters ?? {}) as Record<string, unknown>),
        }),
      },
    );

    return (response.people ?? []).map((person) => ({
      firstName: String(person.first_name ?? person.firstName ?? "Unknown"),
      lastName: String(person.last_name ?? person.lastName ?? "Unknown"),
      email: String(person.email ?? ""),
      company: String(person.organization_name ?? person.company ?? "Unknown"),
      title: String(person.title ?? "Unknown"),
      linkedinUrl: typeof person.linkedin_url === "string" ? person.linkedin_url : undefined,
      source: "apollo",
    })).filter((lead) => !!lead.email);
  }
}

class ClayAdapter implements OutboundProviderAdapter {
  async enrichLead(lead: { email: string; company: string; title: string }): Promise<EnrichedLead> {
    const apiKey = process.env.CLAY_API_KEY;
    const enrichUrl = process.env.CLAY_ENRICH_URL;
    if (apiKey && enrichUrl) {
      const response = await requestJsonWithRetry<Record<string, unknown>>(
        enrichUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: toJsonBody({
            email: lead.email,
            company: lead.company,
            title: lead.title,
          }),
        },
      );

      return {
        industry: typeof response.industry === "string" ? response.industry : undefined,
        companySize: typeof response.company_size === "string"
          ? response.company_size
          : typeof response.companySize === "string"
            ? response.companySize
            : undefined,
        linkedinUrl: typeof response.linkedin_url === "string"
          ? response.linkedin_url
          : typeof response.linkedinUrl === "string"
            ? response.linkedinUrl
            : undefined,
        recentNews: typeof response.recent_news === "string"
          ? response.recent_news
          : typeof response.recentNews === "string"
            ? response.recentNews
            : undefined,
      };
    }

    return {
      industry: "SaaS",
      companySize: "50-200",
      linkedinUrl: `https://linkedin.com/company/${lead.company.toLowerCase().replace(/\s+/g, "-")}`,
      recentNews: `${lead.company} is expanding GTM operations`,
    };
  }
}

class MillionVerifierAdapter implements OutboundProviderAdapter {
  async verifyEmail(email: string): Promise<VerificationResult> {
    const apiKey = process.env.MILLIONVERIFIER_API_KEY;
    if (!apiKey) return scoreEmailQuality(email);

    const baseUrl = process.env.MILLIONVERIFIER_BASE_URL ?? "https://api.millionverifier.com/api/v3/";
    const response = await requestJsonWithRetry<Record<string, unknown>>(
      `${baseUrl}?api=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`,
      {
        method: "GET",
      },
    );

    const status = String(response.result ?? response.status ?? "").toLowerCase();
    if (["ok", "valid", "deliverable"].includes(status)) {
      return { result: "valid", reason: "MillionVerifier marked email valid" };
    }
    if (["invalid", "undeliverable", "rejected"].includes(status)) {
      return { result: "invalid", reason: "MillionVerifier marked email invalid" };
    }
    return { result: "risky", reason: `MillionVerifier result: ${status || "unknown"}` };
  }
}

class ResendAdapter implements OutboundProviderAdapter {
  async sendMessage(payload: {
    to: string;
    subject: string;
    body: string;
    fromDomain?: string | null;
  }): Promise<{ externalMessageId: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? `noreply@${payload.fromDomain ?? "example.com"}`;
    if (!apiKey) {
      return { externalMessageId: randomUUID() };
    }

    const response = await requestJsonWithRetry<{ id?: string }>(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: toJsonBody({
          from: fromEmail,
          to: [payload.to],
          subject: payload.subject,
          text: payload.body,
        }),
      },
    );

    return { externalMessageId: response.id ?? randomUUID() };
  }
}

class InstantlyAdapter implements OutboundProviderAdapter {
  async sendMessage(payload: {
    to: string;
    subject: string;
    body: string;
    fromDomain?: string | null;
  }): Promise<{ externalMessageId: string }> {
    const apiKey = process.env.INSTANTLY_API_KEY;
    const endpoint = process.env.INSTANTLY_SEND_URL;
    if (!apiKey || !endpoint) return { externalMessageId: randomUUID() };

    const response = await requestJsonWithRetry<Record<string, unknown>>(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: toJsonBody({
          to: payload.to,
          subject: payload.subject,
          body: payload.body,
          from_domain: payload.fromDomain ?? null,
        }),
      },
    );

    return { externalMessageId: String(response.id ?? response.message_id ?? randomUUID()) };
  }
}

class SmartleadAdapter implements OutboundProviderAdapter {
  async sendMessage(payload: {
    to: string;
    subject: string;
    body: string;
    fromDomain?: string | null;
  }): Promise<{ externalMessageId: string }> {
    const apiKey = process.env.SMARTLEAD_API_KEY;
    const endpoint = process.env.SMARTLEAD_SEND_URL;
    if (!apiKey || !endpoint) return { externalMessageId: randomUUID() };

    const response = await requestJsonWithRetry<Record<string, unknown>>(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: toJsonBody({
          email: payload.to,
          subject: payload.subject,
          body: payload.body,
          from_domain: payload.fromDomain ?? null,
        }),
      },
    );
    return { externalMessageId: String(response.id ?? response.message_id ?? randomUUID()) };
  }
}

const adapters: Record<string, OutboundProviderAdapter> = {
  apollo: new ApolloAdapter(),
  clay: new ClayAdapter(),
  millionverifier: new MillionVerifierAdapter(),
  instantly: new InstantlyAdapter(),
  smartlead: new SmartleadAdapter(),
  resend: new ResendAdapter(),
};

export function getOutboundAdapter(provider: string): OutboundProviderAdapter {
  return adapters[provider] ?? new ResendAdapter();
}

export function verifyWebhookSignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return signature === expected || signature === `sha256=${expected}`;
}

export function verifyProviderWebhookSignature(provider: string, rawBody: string, headers: Record<string, string | undefined>): boolean {
  const envKey = `WEBHOOK_SECRET_${provider.toUpperCase()}`;
  const secret = process.env[envKey] ?? process.env.WEBHOOK_SECRET_DEFAULT ?? "dev-webhook-secret";

  if (provider === "resend") {
    const signature = headers["resend-signature"] ?? headers["x-resend-signature"] ?? headers["x-webhook-signature"];
    return verifyWebhookSignature(rawBody, signature, secret);
  }

  if (provider === "instantly") {
    const signature = headers["x-instantly-signature"] ?? headers["x-webhook-signature"];
    return verifyWebhookSignature(rawBody, signature, secret);
  }

  if (provider === "smartlead") {
    const signature = headers["x-smartlead-signature"] ?? headers["x-webhook-signature"];
    return verifyWebhookSignature(rawBody, signature, secret);
  }

  return verifyWebhookSignature(rawBody, headers["x-webhook-signature"], secret);
}

export type NormalizedSendingEvent = {
  eventId: string;
  eventType: "sent" | "open" | "reply" | "positive_reply" | "bounce" | "meeting_booked" | "unknown";
  campaignId: number | null;
  leadId: number | null;
  payload: Record<string, unknown>;
};

export function normalizeSendingEvent(provider: string, body: Record<string, unknown>): NormalizedSendingEvent {
  const rawEventType = String(body.eventType ?? body.type ?? body.event ?? "unknown").toLowerCase();
  const normalizedType: NormalizedSendingEvent["eventType"] =
    rawEventType.includes("sent") ? "sent"
      : rawEventType.includes("open") ? "open"
        : rawEventType.includes("bounce") ? "bounce"
          : rawEventType.includes("reply_positive") || rawEventType.includes("positive_reply") ? "positive_reply"
            : rawEventType.includes("reply") ? "reply"
              : rawEventType.includes("meeting") ? "meeting_booked"
                : "unknown";

  const campaignId = typeof body.campaignId === "number"
    ? body.campaignId
    : typeof body.campaign_id === "number"
      ? body.campaign_id
      : null;

  const leadId = typeof body.leadId === "number"
    ? body.leadId
    : typeof body.lead_id === "number"
      ? body.lead_id
      : null;

  const eventId = typeof body.eventId === "string"
    ? body.eventId
    : typeof body.id === "string"
      ? body.id
      : `${provider}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  return {
    eventId,
    eventType: normalizedType,
    campaignId,
    leadId,
    payload: body,
  };
}

export async function launchInstantlyCampaign(payload: {
  campaignName: string;
  subject: string;
  body: string;
  leads: InstantlyLaunchLead[];
  fromDomain?: string | null;
}): Promise<{ externalMessageId: string }> {
  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) {
    throw new Error("INSTANTLY_API_KEY is required for Instantly campaign launch");
  }

  const baseUrl = process.env.INSTANTLY_BASE_URL ?? "https://api.instantly.ai";
  const endpointDefaults: InstantlyEndpointMap = {
    createCampaign: "/api/v2/campaigns",
    addLeads: "/api/v2/leads/add",
    activateCampaignTemplate: "/api/v2/campaigns/{id}/activate",
  };
  const endpointOverrides = parseJsonEnv("INSTANTLY_ENDPOINTS_JSON");
  const endpoints: InstantlyEndpointMap = {
    createCampaign: typeof endpointOverrides.createCampaign === "string"
      ? endpointOverrides.createCampaign
      : endpointDefaults.createCampaign,
    addLeads: typeof endpointOverrides.addLeads === "string"
      ? endpointOverrides.addLeads
      : endpointDefaults.addLeads,
    activateCampaignTemplate: typeof endpointOverrides.activateCampaignTemplate === "string"
      ? endpointOverrides.activateCampaignTemplate
      : endpointDefaults.activateCampaignTemplate,
  };
  const timezone = process.env.INSTANTLY_TIMEZONE ?? "Etc/GMT";

  const defaultCampaignPayload: Record<string, unknown> = {
    name: payload.campaignName,
    campaign_schedule: {
      schedules: [
        {
          name: "Default Schedule",
          timing: { from: "09:00", to: "17:00" },
          days: { "1": true, "2": true, "3": true, "4": true, "5": true },
          timezone,
        },
      ],
    },
  };

  const campaignPayload = {
    ...defaultCampaignPayload,
    ...parseJsonEnv("INSTANTLY_CAMPAIGN_TEMPLATE_JSON"),
  };

  const commonHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const createResponse = await requestJsonWithRetry<Record<string, unknown>>(
    resolveEndpoint(baseUrl, endpoints.createCampaign),
    {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify(campaignPayload),
    },
  );

  const campaignId = String(createResponse.id ?? createResponse.campaign_id ?? "");
  if (!campaignId) {
    throw new Error("Instantly campaign create response did not contain campaign id");
  }

  await requestJsonWithRetry<Record<string, unknown>>(
    resolveEndpoint(baseUrl, endpoints.addLeads),
    {
      method: "POST",
      headers: commonHeaders,
      body: toJsonBody({
        campaign_id: campaignId,
        leads: payload.leads.map((lead) => ({
          email: lead.email,
          first_name: lead.firstName ?? null,
          last_name: lead.lastName ?? null,
          company_name: lead.company ?? null,
        })),
      }),
    },
  );

  const activateCampaignUrl = resolveEndpoint(
    baseUrl,
    endpoints.activateCampaignTemplate.replace("{id}", campaignId),
  );
  await requestJsonWithRetry<Record<string, unknown>>(
    activateCampaignUrl,
    {
      method: "POST",
      headers: commonHeaders,
      body: toJsonBody({}),
    },
  );

  return { externalMessageId: campaignId };
}

// MCP-style wrapper names used by orchestrators.
export const outboundMcpTools = {
  async sourceImport(provider: string, payload: Record<string, unknown>) {
    if (!isOutboundProviderEnabled(provider)) {
      throw new Error(`Provider '${provider}' is disabled`);
    }
    const adapter = getOutboundAdapter(provider);
    if (!adapter.importLeads) return [];
    return adapter.importLeads(payload);
  },
  async enrich(provider: string, lead: { email: string; company: string; title: string }) {
    if (!isOutboundProviderEnabled(provider)) {
      return {};
    }
    const adapter = getOutboundAdapter(provider);
    if (!adapter.enrichLead) return {};
    return adapter.enrichLead(lead);
  },
  async verify(provider: string, email: string) {
    if (!isOutboundProviderEnabled(provider)) {
      return { result: "risky", reason: `Provider '${provider}' is disabled` } as const;
    }
    const adapter = getOutboundAdapter(provider);
    if (!adapter.verifyEmail) return { result: "risky", reason: "Provider missing verification method" } as const;
    return adapter.verifyEmail(email);
  },
  async send(provider: string, payload: { to: string; subject: string; body: string; fromDomain?: string | null }) {
    if (!isOutboundProviderEnabled(provider)) {
      throw new Error(`Provider '${provider}' is disabled`);
    }
    const adapter = getOutboundAdapter(provider);
    if (!adapter.sendMessage) return { externalMessageId: randomUUID() };
    return adapter.sendMessage(payload);
  },
};
