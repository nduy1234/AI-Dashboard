import { startOutboundWorker } from "./lib/outboundQueue";

if (!process.env.REDIS_URL) {
  console.error("REDIS_URL is required to run dedicated worker process.");
  process.exit(1);
}

startOutboundWorker();
console.log("Outbound worker started.");

process.stdin.resume();
