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

export type OutboundProvider =
  | "apollo"
  | "csv_import"
  | "clay"
  | "millionverifier"
  | "instantly"
  | "smartlead"
  | "resend";
