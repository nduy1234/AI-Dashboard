export const outboundPhaseOneConfig = {
  scope: "ai_outbound",
  providers: {
    source: ["apollo", "csv_import"],
    enrichment: ["clay", "manual_fallback"],
    verification: ["millionverifier", "internal_rule_engine"],
    sending: ["instantly", "smartlead", "resend"],
    orchestration: ["n8n", "langchain"],
    modelRouting: ["openai", "ollama", "groq"],
  },
  kpiTargets: {
    minimumDeliverabilityRatePct: 95,
    minimumOpenRatePct: 35,
    minimumReplyRatePct: 5,
    minimumPositiveReplyRatePct: 1,
  },
} as const;

const disabledProviders = new Set(
  (process.env.OUTBOUND_DISABLED_PROVIDERS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

export function isOutboundProviderEnabled(provider: string): boolean {
  return !disabledProviders.has(provider.toLowerCase());
}

export function getOutboundRuntimeConfig() {
  return {
    ...outboundPhaseOneConfig,
    providers: {
      ...outboundPhaseOneConfig.providers,
      enrichment: outboundPhaseOneConfig.providers.enrichment.filter((provider) => isOutboundProviderEnabled(provider)),
      sending: outboundPhaseOneConfig.providers.sending.filter((provider) => isOutboundProviderEnabled(provider)),
    },
    disabledProviders: Array.from(disabledProviders),
  };
}

export type OutboundProvider =
  | "apollo"
  | "csv_import"
  | "clay"
  | "millionverifier"
  | "instantly"
  | "smartlead"
  | "resend";
