import { startOutboundWorker } from "./lib/outboundQueue";
import { setGlobalDispatcher, Agent } from "undici";

// Apply global workaround for Node.js native fetch IPv6 timeout issues 
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

if (!process.env.REDIS_URL) {
  console.error("REDIS_URL is required to run dedicated worker process.");
  process.exit(1);
}

startOutboundWorker();
console.log("Outbound worker started.");

process.stdin.resume();
