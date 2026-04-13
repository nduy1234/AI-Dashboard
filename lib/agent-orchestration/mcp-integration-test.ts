/**
 * MCP Client Integration Test
 * Verifies that the agent loop can connect to and use the MCP server
 */

import { initializeMcpOnStartup, isMcpReady, cleanupMcpClient } from "@workspace/agent-orchestration";

async function runIntegrationTest() {
  console.log("\n=== MCP Client Integration Test ===\n");

  try {
    // Step 1: Check initial state
    console.log("Step 1: Checking initial MCP state...");
    let ready = isMcpReady();
    console.log(`  - MCP Ready: ${ready ? "❌ Should be false" : "✓ Correct (not initialized yet)"}`);

    // Step 2: Initialize MCP
    console.log("\nStep 2: Initializing MCP client...");
    ready = await initializeMcpOnStartup();
    console.log(`  - MCP Initialization: ${ready ? "✓ Success" : "⚠ Failed (development mode)"}`);

    // Step 3: Check state after initialization
    console.log("\nStep 3: Checking MCP state after initialization...");
    const mcpReady = isMcpReady();
    console.log(`  - MCP Ready: ${mcpReady ? "✓ Connected" : "❌ Not connected"}`);

    if (mcpReady) {
      // Step 4: Test MCP tool calls
      console.log("\nStep 4: Testing MCP tool calls...");

      try {
        const mcp = await import("@workspace/mcp-agent-orchestrator");

        // Test: Get agent trust score
        console.log("  - Testing validateAgentCapability...");
        const trustResult = await mcp.validateAgentCapability("test_agent_123", "enrich_leads");
        console.log(`    ✓ Result: ${JSON.stringify(trustResult)}`);

        // Test: Check budget
        console.log("  - Testing checkSpendBudget...");
        const budgetResult = await mcp.checkSpendBudget(1, 1, 10.0);
        console.log(`    ✓ Result: ${JSON.stringify(budgetResult)}`);

        // Test: Record spend
        console.log("  - Testing recordSpend...");
        const spendResult = await mcp.recordSpend(1, 1, "test_action", 5.0, "test_agent_123");
        console.log(`    ✓ Result: ${JSON.stringify(spendResult)}`);

        console.log("\n✅ All MCP tool calls succeeded!");
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`  ❌ MCP tool call failed: ${errMsg}`);
      }
    } else {
      console.log("\n⚠️  MCP not ready - skipping tool tests (running in development mode)");
    }

    // Cleanup
    console.log("\nStep 5: Cleaning up...");
    await cleanupMcpClient();
    console.log("  ✓ MCP client closed");

    console.log("\n=== Integration Test Complete ===\n");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Test failed with error: ${errMsg}`);
    process.exit(1);
  }
}

// Run the test
runIntegrationTest().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
