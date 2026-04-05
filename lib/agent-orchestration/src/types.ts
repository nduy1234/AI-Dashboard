/**
 * Agent Orchestration Types
 * Shared type definitions for LangChain agent loop
 */

export type ActionType = 
  | "source_leads"
  | "enrich_leads"
  | "verify_emails"
  | "generate_content"
  | "send_campaign"
  | "review_signals"
  | "adjust_strategy"
  | "pause"
  | "complete";

export interface AgentConfig {
  orgId: number;
  userId: string;
  campaignId: number;
  agentId?: string; // Generated UUID
  maxIterations: number;
  temperature: 0.1 | 0.3 | 0.5; // Lower = more deterministic
  enableLearning: boolean;
  mcpServerUrl?: string; // Optional MCP connection override
}

export interface LeadBatch {
  campaignId: number;
  leads: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    company: string;
    title: string;
    industry?: string;
    companySize?: string;
    linkedinUrl?: string;
    revenue?: string;
    website?: string;
    status: "pending" | "enriched" | "verified" | "personalized" | "sent" | "failed";
    score?: number;
    failureReason?: string;
  }[];
}

export interface AgentDecision {
  action: ActionType;
  toolsToTry: string[]; // Ordered list: tries first, then second, etc.
  reasoning: string;
  confidence: number; // 0.0 - 1.0
  expectedOutcome?: string;
  metrics?: {
    estimatedLeadsProcessed?: number;
    estimatedCostUsd?: number;
  };
}

export interface AgentMemorySnapshot {
  campaignId: number;
  decisions: AgentDecision[];
  outcomes: Array<{
    decision: AgentDecision;
    success: boolean;
    resultSummary: string;
    timestamp: Date;
  }>;
  learnedPatterns: {
    bestToolForAction: Record<string, string>; // e.g., { enrich_leads: "clay" }
    recentSignals: Record<string, number>; // e.g., { open_rate: 0.28, reply_rate: 0.12 }
    failurePatterns: string[];
  };
}

export interface AgentOutcome {
  campaignId: number;
  agentId: string;
  status: "completed" | "paused" | "failed";
  totalIterations: number;
  leadsProcessed: number;
  leadsSuccessful: number;
  leadsFailed: number;
  totalCostUsd: number;
  executionTimeMs: number;
  memory: AgentMemorySnapshot;
  decisions: AgentDecision[];
  errors?: string[];
}

export interface ToolExecutionResult {
  action: ActionType;
  tool: string;
  success: boolean;
  leadsProcessed: number;
  leadsFailed: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
  error?: string;
  executionTimeMs: number;
}

export interface CampaignSignal {
  campaignId: number;
  leadId?: number;
  signalType: "open" | "click" | "reply" | "positive_reply" | "bounce" | "unsubscribe";
  timestamp: Date;
  externalId?: string; // From webhook (e.g., Resend message ID)
  metadata?: Record<string, unknown>;
}

export interface TrustGateRequest {
  agentId: string;
  action: string;
  orgId: number;
  metadata?: Record<string, unknown>;
}

export interface TrustGateResponse {
  allowed: boolean;
  trustScore: number; // 0.0 - 1.0
  reason?: string;
  erc8004Status?: {
    registered: boolean;
    weightedTrustScore?: number;
    reputationSignals?: number;
  };
}

export interface SpendGuardRequest {
  orgId: number;
  campaignId: number;
  action: string;
  estimatedCostUsd: number;
}

export interface SpendGuardResponse {
  allowed: boolean;
  remainingBudgetUsd: number;
  guardApplied?: string; // "budget" | "rate_limit" | "recipient"
  reason?: string;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputs: {
    [key: string]: {
      type: "string" | "number" | "boolean" | "object" | "array";
      description: string;
      required?: boolean;
    };
  };
}
