import app from "./app";
import { setGlobalDispatcher, Agent } from "undici";
import { seedDatabase } from "./seed";

// Apply global workaround for Node.js native fetch IPv6 timeout issues 
// by enforcing IPv4 resolution for all fetch API requests.
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
import { startOutboundWorker } from "./lib/outboundQueue";
import { startReactivationWorkers } from "./services/reactivationService";

const isDev = process.env.NODE_ENV !== "production";
const rawPort = process.env["PORT"] || (isDev ? "5000" : undefined);

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  console.log(`\x1b[36m[Server]\x1b[0m Listening on port ${port}`);
  
  // Initialize MCP client for agent control plane (lazy load)
  try {
    console.log(`\x1b[36m[Agent]\x1b[0m Initializing MCP client for agent framework`);
    const mod = await import("../../../lib/agent-orchestration/dist/index.js" as any);
    if (mod.initializeMcpOnStartup) {
      await mod.initializeMcpOnStartup();
    }
  } catch (err) {
    console.warn(`\x1b[33m[Server]\x1b[0m MCP initialization failed:`, err instanceof Error ? err.message : String(err));
    console.log(`\x1b[33m[Server]\x1b[0m Continuing without MCP - agents will run without controls`);
  }
  
  startOutboundWorker();
  startReactivationWorkers();
  try {
    await seedDatabase();
  } catch (err) {
    console.error("Seed error:", err);
  }
});
