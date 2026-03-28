import { createHmac, randomUUID } from "node:crypto";

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

    return [];
  }
}

class ClayAdapter implements OutboundProviderAdapter {
  async enrichLead(lead: { email: string; company: string; title: string }): Promise<EnrichedLead> {
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
    return scoreEmailQuality(email);
  }
}

class SendingAdapter implements OutboundProviderAdapter {
  async sendMessage(): Promise<{ externalMessageId: string }> {
    return { externalMessageId: randomUUID() };
  }
}

const adapters: Record<string, OutboundProviderAdapter> = {
  apollo: new ApolloAdapter(),
  clay: new ClayAdapter(),
  millionverifier: new MillionVerifierAdapter(),
  instantly: new SendingAdapter(),
  smartlead: new SendingAdapter(),
  resend: new SendingAdapter(),
};

export function getOutboundAdapter(provider: string): OutboundProviderAdapter {
  return adapters[provider] ?? new SendingAdapter();
}

export function verifyWebhookSignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return signature === expected;
}

// MCP-style wrapper names used by orchestrators.
export const outboundMcpTools = {
  async sourceImport(provider: string, payload: Record<string, unknown>) {
    const adapter = getOutboundAdapter(provider);
    if (!adapter.importLeads) return [];
    return adapter.importLeads(payload);
  },
  async enrich(provider: string, lead: { email: string; company: string; title: string }) {
    const adapter = getOutboundAdapter(provider);
    if (!adapter.enrichLead) return {};
    return adapter.enrichLead(lead);
  },
  async verify(provider: string, email: string) {
    const adapter = getOutboundAdapter(provider);
    if (!adapter.verifyEmail) return { result: "risky", reason: "Provider missing verification method" } as const;
    return adapter.verifyEmail(email);
  },
  async send(provider: string, payload: { to: string; subject: string; body: string; fromDomain?: string | null }) {
    const adapter = getOutboundAdapter(provider);
    if (!adapter.sendMessage) return { externalMessageId: randomUUID() };
    return adapter.sendMessage(payload);
  },
};
