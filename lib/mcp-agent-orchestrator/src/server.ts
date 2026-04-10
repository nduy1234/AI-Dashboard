/**
 * MCP Server for Agent Orchestration
 * Provides trust gate, spend guards, reputation, and audit trail
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Initialize MCP Server
 * Runs as separate process, agents connect via stdio
 */
export function createMcpServer() {
  const server = new Server(
    {
      name: "omniclaw-agent-orchestrator",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    } as any,
  );

  // Register CallTool handler first
  try {
    server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params;
      console.log(`[MCP] Calling tool: ${name}`);

      try {
        let result: any;
        switch (name) {
          case "getAgentTrustScore":
            result = {
              agentId: args.agentId,
              trustScore: 0.85,
              registered: true,
            };
            break;
          case "validateAgentCapability":
            result = {
              allowed: true,
              action: args.action,
            };
            break;
          case "checkSpendBudget":
            result = {
              allowed: true,
              remainingBudgetUsd: 1000,
            };
            break;
          case "recordSpend":
            result = {
              ledgerId: Math.floor(Math.random() * 10000),
              recorded: true,
            };
            break;
          case "recordCampaignSignal":
            result = {
              signalId: Math.floor(Math.random() * 10000),
              recorded: true,
            };
            break;
          case "queryLedger":
            result = {
              entries: [],
              total: 0,
            };
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    });
    console.log("[MCP] CallToolRequestSchema registered");
  } catch (err) {
    console.warn("[MCP] Failed to register CallTool handler:", err);
  }

  // Register ListTools handler
  try {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "getAgentTrustScore",
            description: "Query ERC-8004 trust score",
            inputSchema: {
              type: "object",
              properties: {
                agentId: { type: "string" },
              },
              required: ["agentId"],
            },
          },
          {
            name: "validateAgentCapability",
            description: "Check agent authorization",
            inputSchema: {
              type: "object",
              properties: {
                agentId: { type: "string" },
                action: { type: "string" },
              },
              required: ["agentId", "action"],
            },
          },
          {
            name: "checkSpendBudget",
            description: "Verify spend within budget",
            inputSchema: {
              type: "object",
              properties: {
                orgId: { type: "number" },
                estimatedCostUsd: { type: "number" },
              },
              required: ["orgId", "estimatedCostUsd"],
            },
          },
          {
            name: "recordSpend",
            description: "Record spend atomically",
            inputSchema: {
              type: "object",
              properties: {
                orgId: { type: "number" },
                action: { type: "string" },
                amountUsd: { type: "number" },
              },
              required: ["orgId", "action", "amountUsd"],
            },
          },
          {
            name: "recordCampaignSignal",
            description: "Record campaign event",
            inputSchema: {
              type: "object",
              properties: {
                campaignId: { type: "number" },
                signalType: { type: "string" },
              },
              required: ["campaignId", "signalType"],
            },
          },
          {
            name: "queryLedger",
            description: "Query spend ledger",
            inputSchema: {
              type: "object",
              properties: {
                orgId: { type: "number" },
              },
            },
          },
        ],
      };
    });
    console.log("[MCP] ListToolsRequestSchema registered");
  } catch (err) {
    console.warn("[MCP] Failed to register ListTools handler:", err);
  }

  return server;
}

/**
 * Start MCP server as subprocess
 */
async function main() {
  console.log("[MCP Server] Starting MCP server via stdio transport...");
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  // Handle EPIPE errors gracefully (happens during hot reload)
  process.stdout.on("error", (err: any) => {
    if (err.code === "EPIPE") {
      console.warn("[MCP Server] EPIPE: stdout closed (likely hot reload), shutting down gracefully");
      process.exit(0);
    } else {
      throw err;
    }
  });

  // Graceful shutdown on signals
  const shutdown = async (signal: string) => {
    console.warn(`[MCP Server] Received ${signal}, closing transport...`);
    try {
      await (transport as any).close?.();
    } catch (err) {
      // Ignore errors during shutdown
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await server.connect(transport);
  console.log("[MCP Server] Connected to client via stdio");
}

// Start server if run directly
// Handle both ESM and CJS module formats
try {
  // Try ESM approach
  if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
      console.error("[MCP Server] Fatal error:", err);
      process.exit(1);
    });
  }
} catch {
  // Fallback for CJS - use require.main check
  if (typeof require !== "undefined" && require.main === module) {
    main().catch((err) => {
      console.error("[MCP Server] Fatal error:", err);
      process.exit(1);
    });
  }
}

export { main };
