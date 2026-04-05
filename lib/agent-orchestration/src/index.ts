/**
 * Agent Orchestration Public API
 * Main entry point for integrating LangChain-based agents
 */

export { runOutboundAgent, cleanupMcpClient, initializeMcpOnStartup, isMcpReady, getMcpToolsForDispatcher } from "./agent.js";
export { AgentMemory } from "./memory.js";
export { executeAgentTool } from "./tools/index.js";
export {
  handleResendWebhook,
  handleInstantlyWebhook,
  handleCalcomWebhook,
  handleProviderWebhook,
  computeSignalKpis,
} from "./webhooks.js";
export {
  persistAgentDecision,
  updateAgentDecisionResult,
  persistAgentMemoryPattern,
  recordCampaignSignal,
  getCampaignSignalsKpis,
  getAgentDecisions,
  getToolPerformance,
} from "./repository.js";

export type {
  AgentConfig,
  AgentDecision,
  AgentOutcome,
  LeadBatch,
  ToolExecutionResult,
  CampaignSignal,
  TrustGateRequest,
  TrustGateResponse,
  SpendGuardRequest,
  SpendGuardResponse,
  ActionType,
  AgentMemorySnapshot,
  AgentToolDefinition,
} from "./types.js";
