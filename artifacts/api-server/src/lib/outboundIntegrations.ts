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

// Apollo API endpoint types (https://docs.apollo.io/reference/authentication)
type ApolloSearchType =
  | "contacts_search"
  | "organization_top_people"
  | "organization_search"
  | "organization_enrich"
  | "people_enrichment"
  | "people_bulk_enrichment"
  | "organization_bulk_enrich"
  | "news_search"
  | "deals_search"
  | "tasks_search"
  | "calls_search"
  | "sequences_search"
  | "outreach_emails_search";

interface ApolloSearchConfig {
  endpoint: string;
  responseKey: string;
  method: "GET" | "POST" | "PATCH" | "PUT";
  mapFn: (item: Record<string, unknown>) => Record<string, unknown>;
  requiresEmail: boolean;
}

const APOLLO_SEARCH_CONFIG: Record<ApolloSearchType, ApolloSearchConfig> = {
  // Search your own saved Apollo contacts — returns full data including emails
  contacts_search: {
    endpoint: "/api/v1/contacts/search",
    responseKey: "contacts",
    method: "POST",
    requiresEmail: true,
    mapFn: (contact) => ({
      firstName: String(contact.first_name ?? "Unknown"),
      lastName: String(contact.last_name ?? ""),
      email: String(contact.email ?? ""),
      company: String(contact.organization_name ?? contact.company ?? "Unknown"),
      title: String(contact.title ?? "Unknown"),
      linkedinUrl: typeof contact.linkedin_url === "string" ? contact.linkedin_url : undefined,
      apolloId: String(contact.id ?? ""),
      source: "apollo",
    }),
  },
  // Get key decision-makers from a specific company — pass organization_id in filters
  // Use after organization_search to drill into a company's top people
  organization_top_people: {
    endpoint: "/api/v1/mixed_people/organization_top_people",
    responseKey: "people",
    method: "POST",
    requiresEmail: false,
    mapFn: (person) => ({
      firstName: String(person.first_name ?? "Unknown"),
      lastName: String(person.last_name ?? person.last_name_obfuscated ?? ""),
      email: String(person.email ?? ""),
      company: String((person.organization as Record<string, unknown> | undefined)?.name ?? person.organization_name ?? "Unknown"),
      title: String(person.title ?? "Unknown"),
      linkedinUrl: typeof person.linkedin_url === "string" ? person.linkedin_url : undefined,
      apolloId: String(person.id ?? ""),
      hasEmail: Boolean(person.has_email),
      source: "apollo",
    }),
  },
  // Find companies matching filters — returns Apollo org IDs to feed into organization_top_people
  organization_search: {
    endpoint: "/api/v1/organizations/search",
    responseKey: "organizations",
    method: "POST",
    requiresEmail: false,
    mapFn: (org) => ({
      firstName: "",
      lastName: "",
      email: "",
      company: String(org.name ?? "Unknown"),
      title: "",
      industry: String(org.industry ?? ""),
      companySize: String(org.num_employees ?? org.estimated_num_employees ?? ""),
      linkedinUrl: typeof org.linkedin_url === "string" ? org.linkedin_url : undefined,
      website: typeof org.website_url === "string" ? org.website_url : undefined,
      apolloId: String(org.id ?? ""),
      source: "apollo",
    }),
  },
  // Enrich a single company by domain — pass domain in filters e.g. { "domain": "stripe.com" }
  organization_enrich: {
    endpoint: "/api/v1/organizations/enrich",
    responseKey: "organization",
    method: "GET",
    requiresEmail: false,
    mapFn: (org) => ({
      firstName: "",
      lastName: "",
      email: "",
      company: String(org.name ?? "Unknown"),
      title: "",
      industry: String(org.industry ?? ""),
      companySize: String(org.num_employees ?? org.estimated_num_employees ?? ""),
      linkedinUrl: typeof org.linkedin_url === "string" ? org.linkedin_url : undefined,
      website: typeof org.website_url === "string" ? org.website_url : undefined,
      apolloId: String(org.id ?? ""),
      source: "apollo",
    }),
  },
  // Enrich a single person by email
  people_enrichment: {
    endpoint: "/api/v1/people/enrichment",
    responseKey: "person",
    method: "POST",
    requiresEmail: true,
    mapFn: (person) => ({
      firstName: String(person.first_name ?? "Unknown"),
      lastName: String(person.last_name ?? ""),
      email: String(person.email ?? ""),
      company: String(person.organization_name ?? "Unknown"),
      title: String(person.title ?? "Unknown"),
      linkedinUrl: typeof person.linkedin_url === "string" ? person.linkedin_url : undefined,
      apolloId: String(person.id ?? ""),
      source: "apollo",
    }),
  },
  // Bulk enrich multiple people by email
  people_bulk_enrichment: {
    endpoint: "/api/v1/people/bulk_enrichment",
    responseKey: "enrichment_details",
    method: "POST",
    requiresEmail: true,
    mapFn: (person) => ({
      firstName: String(person.first_name ?? "Unknown"),
      lastName: String(person.last_name ?? ""),
      email: String(person.email ?? ""),
      company: String(person.organization_name ?? "Unknown"),
      title: String(person.title ?? "Unknown"),
      linkedinUrl: typeof person.linkedin_url === "string" ? person.linkedin_url : undefined,
      apolloId: String(person.id ?? ""),
      source: "apollo",
    }),
  },
  // Bulk enrich multiple organizations
  organization_bulk_enrich: {
    endpoint: "/api/v1/organizations/bulk_enrich",
    responseKey: "enrichment_details",
    method: "POST",
    requiresEmail: false,
    mapFn: (org) => ({
      firstName: "",
      lastName: "",
      email: "",
      company: String(org.name ?? "Unknown"),
      title: "",
      industry: String(org.industry ?? ""),
      companySize: String(org.num_employees ?? org.estimated_num_employees ?? ""),
      linkedinUrl: typeof org.linkedin_url === "string" ? org.linkedin_url : undefined,
      website: typeof org.website_url === "string" ? org.website_url : undefined,
      apolloId: String(org.id ?? ""),
      source: "apollo",
    }),
  },
  // Search for news articles about companies
  news_search: {
    endpoint: "/api/v1/news/search",
    responseKey: "news_articles",
    method: "POST",
    requiresEmail: false,
    mapFn: (article) => ({
      firstName: "",
      lastName: "",
      email: "",
      company: String((article.organization as Record<string, unknown> | undefined)?.name ?? "Unknown"),
      title: String(article.headline ?? article.title ?? "Unknown"),
      linkedinUrl: typeof article.url === "string" ? article.url : undefined,
      source: "apollo",
    }),
  },
  // Search for deals
  deals_search: {
    endpoint: "/api/v1/deals",
    responseKey: "deals",
    method: "GET",
    requiresEmail: false,
    mapFn: (deal) => ({
      firstName: "",
      lastName: "",
      email: "",
      company: String(deal.name ?? "Unknown"),
      title: String(deal.stage ?? "Unknown"),
      apolloId: String(deal.id ?? ""),
      source: "apollo",
    }),
  },
  // Search for tasks
  tasks_search: {
    endpoint: "/api/v1/tasks/search",
    responseKey: "tasks",
    method: "POST",
    requiresEmail: false,
    mapFn: (task) => ({
      firstName: "",
      lastName: "",
      email: "",
      company: String(task.account_id ?? "Unknown"),
      title: String(task.subject ?? task.title ?? "Unknown"),
      apolloId: String(task.id ?? ""),
      source: "apollo",
    }),
  },
  // Search for calls
  calls_search: {
    endpoint: "/api/v1/calls/search",
    responseKey: "calls",
    method: "GET",
    requiresEmail: false,
    mapFn: (call) => ({
      firstName: "",
      lastName: "",
      email: "",
      company: String((call.contact as Record<string, unknown> | undefined)?.name ?? "Unknown"),
      title: String(call.note ?? "Unknown"),
      apolloId: String(call.id ?? ""),
      source: "apollo",
    }),
  },
  // Search for sequences
  sequences_search: {
    endpoint: "/api/v1/sequences/search",
    responseKey: "sequences",
    method: "POST",
    requiresEmail: false,
    mapFn: (seq) => ({
      firstName: "",
      lastName: "",
      email: "",
      company: "",
      title: String(seq.name ?? "Unknown"),
      apolloId: String(seq.id ?? ""),
      source: "apollo",
    }),
  },
  // Search for outreach emails
  outreach_emails_search: {
    endpoint: "/api/v1/outreach_emails/search",
    responseKey: "outreach_emails",
    method: "GET",
    requiresEmail: false,
    mapFn: (email) => ({
      firstName: String((email.contact as Record<string, unknown> | undefined)?.first_name ?? "Unknown"),
      lastName: String((email.contact as Record<string, unknown> | undefined)?.last_name ?? ""),
      email: String(email.email ?? ""),
      company: String((email.contact as Record<string, unknown> | undefined)?.organization_name ?? "Unknown"),
      title: String((email.contact as Record<string, unknown> | undefined)?.title ?? "Unknown"),
      apolloId: String(email.id ?? ""),
      source: "apollo",
    }),
  },
};

class ApolloAdapter implements OutboundProviderAdapter {
  async importLeads(payload: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
    const csvLeads = payload.leads;
    if (Array.isArray(csvLeads)) {
      return csvLeads.filter((lead): lead is Record<string, unknown> => !!lead && typeof lead === "object");
    }

    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) return [];

    const searchType = (payload.apolloSearchType as ApolloSearchType | undefined) ?? "contacts_search";
    const config = APOLLO_SEARCH_CONFIG[searchType] ?? APOLLO_SEARCH_CONFIG.contacts_search;
    const baseUrl = process.env.APOLLO_BASE_URL ?? "https://api.apollo.io";
    const filters = (payload.filters ?? {}) as Record<string, unknown>;

    // GET endpoints use query params; other methods (POST, PATCH, PUT) use JSON body
    let url = `${baseUrl}${config.endpoint}`;
    let fetchInit: RequestInit;

    if (config.method === "GET") {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
      url = `${url}?${params.toString()}`;
      fetchInit = { method: "GET", headers: { "Content-Type": "application/json", "X-Api-Key": apiKey } };
    } else {
      // POST, PATCH, PUT all use JSON body
      fetchInit = {
        method: config.method,
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: toJsonBody({
          page: Number(payload.page ?? 1),
          per_page: Number(payload.perPage ?? 25),
          ...filters,
        }),
      };
    }

    const response = await requestJsonWithRetry<Record<string, unknown>>(url, fetchInit);

    const raw = response[config.responseKey];
    const items: Array<Record<string, unknown>> = Array.isArray(raw)
      ? raw
      : raw !== null && raw !== undefined
        ? [raw as Record<string, unknown>]
        : [];

    const mapped = items.map(config.mapFn);
    return config.requiresEmail ? mapped.filter((lead) => !!lead.email) : mapped;
  }
}

class ClayAdapter implements OutboundProviderAdapter {
  async enrichLead(lead: { email: string; company: string; title: string }): Promise<EnrichedLead> {
    const apiKey = process.env.CLAY_API_KEY;
    const enrichUrl = process.env.CLAY_ENRICH_URL;
    const webhookAuthToken = process.env.CLAY_WEBHOOK_AUTH_TOKEN;

    if (enrichUrl && (webhookAuthToken || apiKey)) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (webhookAuthToken) {
        headers["x-clay-webhook-auth"] = webhookAuthToken;
      } else if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await requestJsonWithRetry<Record<string, unknown>>(
        enrichUrl,
        {
          method: "POST",
          headers,
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

    // Fallback to heuristic if account has no credits
    if (response.error === "Insufficient credits" || Number(response.credits) === 0) {
      console.warn(`[millionverifier] no credits remaining — falling back to heuristic for ${email}`);
      return scoreEmailQuality(email);
    }

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
      console.warn("[resend] RESEND_API_KEY is not set — skipping real send, returning fake message ID");
      return { externalMessageId: randomUUID() };
    }

    console.log(`[resend] sending email to=${payload.to} from=${fromEmail} subject="${payload.subject}"`);

    try {
      const response = await requestJsonWithRetry<{ id?: string; name?: string; message?: string }>(
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

      const messageId = response.id ?? randomUUID();
      console.log(`[resend] email sent successfully id=${messageId} to=${payload.to}`);
      return { externalMessageId: messageId };
    } catch (err) {
      console.error(`[resend] failed to send email to=${payload.to}:`, err instanceof Error ? err.message : err);
      throw err;
    }
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
    if (!adapter.sendMessage) {
      console.warn(`[outbound] provider '${provider}' has no sendMessage implementation — returning fake message ID`);
      return { externalMessageId: randomUUID() };
    }
    return adapter.sendMessage(payload);
  },
};
