#!/usr/bin/env node

import { launchAgentForCampaign } from "./src/agentLauncher.js";

console.log("Launching agent for campaign 44...");

launchAgentForCampaign({
  campaignId: 44,
  owner: {
    userId: "8990767d-d777-4bc9-a6dc-cbf87252e1b1",
    orgId: 1,
  },
  maxIterations: 10,
  enableLearning: true,
}).then(() => {
  console.log("Agent launched successfully");
  process.exit(0);
}).catch((err) => {
  console.error("Failed to launch agent:", err);
  process.exit(1);
});
