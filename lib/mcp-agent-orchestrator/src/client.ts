/**
 * MCP Client Wrapper
 * Simplifies calling MCP server tools from agent
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

let mcpClient: Client | null = null;
let cachedTools: Array<any> = [];

export async function initMcpClient() {
  if (mcpClient) return mcpClient;

  console.log("[MCP Client] Initializing connection to MCP server...");

  try {
    // Calculate path from this file's location: dist/client.js -> ../../dist/server.js
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const serverPath = path.join(__dirname, "server.js");
    
    const transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env: {
        ...process.env,
        MODE: "server",
      },
    });

    mcpClient = new Client({
      name: "outbound-agent-client",
      version: "1.0.0",
    });

    // Handle transport errors gracefully (EPIPE during hot reload)
    (transport as any).on?.("error", (err: any) => {
      if (err?.code === "EPIPE" || err?.code === "ERR_STREAM_DESTROYED") {
        console.warn("[MCP Client] Transport error during reload, will retry on next call:", err?.code);
        mcpClient = null; // Reset to force reconnect
      } else {
        console.warn("[MCP Client] Transport error:", err?.message);
      }
    });

    await mcpClient.connect(transport);
    console.log("[MCP Client] Connected to MCP server");
    
    // Fetch available tools after connection
    try {
      const toolsResponse = await mcpClient.listTools();
      cachedTools = toolsResponse.tools || [];
      console.log(`[MCP Client] Loaded ${cachedTools.length} tools from server`);
    } catch (err) {
      console.warn("[MCP Client] Failed to list tools:", err instanceof Error ? err.message : String(err));
    }
    
    return mcpClient;
  } catch (err) {
    console.warn("[MCP Client] Failed to connect to MCP server:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function getMcpClient() {
  if (!mcpClient) {
    return initMcpClient();
  }
  return mcpClient;
}

export async function closeMcpClient() {
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch (err) {
      console.warn("[MCP Client] Error closing client:", err instanceof Error ? err.message : String(err));
    }
    mcpClient = null;
    cachedTools = [];
  }
}

/**
 * Get cached MCP tools (for agent tool dispatcher)
 */
export function getMcpTools() {
  return cachedTools;
}

/**
 * Wrapper functions for common MCP calls
 * Returns mock/default values if MCP server is not available
 */

/**
 * Helper to safely call MCP tools with error recovery
 */
async function callMcpToolSafely<T>(toolName: string, args: any, defaultValue: T): Promise<T> {
  try {
    const client = await getMcpClient();
    if (!client) {
      return defaultValue;
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content[0]?.type === "text" && content[0].text ? content[0].text : "{}";
    return JSON.parse(text) as T;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // On EPIPE or stream errors, reset client for next attempt
    if (errMsg.includes("EPIPE") || errMsg.includes("ERR_STREAM")) {
      console.warn(`[MCP Client] ${toolName} failed due to transport error, will retry:`, errMsg);
      mcpClient = null;
    } else {
      console.warn(`[MCP Client] ${toolName} failed:`, errMsg);
    }
    return defaultValue;
  }
}

export async function getAgentTrustScore(agentId: string) {
  return callMcpToolSafely(
    "getAgentTrustScore",
    { agentId },
    { agentId, trustScore: 0.5, registered: false },
  );
}

export async function validateAgentCapability(agentId: string, action: string) {
  return callMcpToolSafely(
    "validateAgentCapability",
    { agentId, action },
    { allowed: true, agentId, action, reason: "MCP unavailable - allowing request" },
  );
}

export async function checkSpendBudget(
  orgId: number,
  campaignId: number | undefined,
  estimatedCostUsd: number,
) {
  return callMcpToolSafely(
    "checkSpendBudget",
    { orgId, campaignId, estimatedCostUsd },
    { allowed: true, remainingBudgetUsd: 99999, reason: "MCP unavailable - allowing spend" },
  );
}

export async function recordSpend(
  orgId: number,
  campaignId: number | undefined,
  action: string,
  amountUsd: number,
  agentId?: string,
) {
  return callMcpToolSafely(
    "recordSpend",
    {
      orgId,
      campaignId,
      action,
      amountUsd,
      guardApplied: "budget",
      agentId: agentId || "unknown",
    },
    { recorded: false, reason: "MCP unavailable" },
  );
}

export async function recordCampaignSignal(
  campaignId: number,
  signalType: string,
  leadId?: number,
) {
  return callMcpToolSafely(
    "recordCampaignSignal",
    { campaignId, leadId, signalType },
    { recorded: false, reason: "MCP unavailable" },
  );
}
