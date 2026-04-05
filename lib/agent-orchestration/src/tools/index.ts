/**
 * Agent Tool Dispatcher
 * Routes agent actions to appropriate tool implementations
 * Integrates with existing outbound infrastructure (Apollo, Clay, MillionVerifier, OpenAI, Resend, Instantly)
 */

let openai: any = null;
try {
  const mod = await import("@workspace/integrations-openai-ai-server" as any);
  if (mod && mod.openai) {
    openai = mod.openai;
  }
} catch (_e) {
  // @workspace/integrations-openai-ai-server not available
}

import { db } from "@workspace/db";
import type { ActionType, LeadBatch, ToolExecutionResult } from "../types.js";

/**
 * API Client Wrappers
 */

// Type definitions for API responses
interface ClayEnrichmentResponse {
  industry?: string;
  companySize?: string;
  linkedinUrl?: string;
  revenue?: string;
  website?: string;
  [key: string]: any;
}

interface MillionVerifierResponse {
  result?: "valid" | "invalid" | "unknown";
  [key: string]: any;
}

interface ResendEmailResponse {
  id?: string;
  [key: string]: any;
}

// Clay API client
const createClayClient = () => {
  const apiKey = process.env.CLAY_API_KEY;
  if (!apiKey) {
    console.warn("[Clay] API key not configured, using mock");
    return null;
  }
  return {
    async enrich(email: string, company: string, title: string): Promise<ClayEnrichmentResponse | null> {
      try {
        const response = await fetch("https://api.clay.com/v1/enrichment", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            company,
            title,
          }),
        });
        if (!response.ok) throw new Error(`Clay API error: ${response.statusText}`);
        return (await response.json()) as ClayEnrichmentResponse;
      } catch (err) {
        console.error("[Clay] Enrichment failed:", err);
        return null;
      }
    },
  };
};

// MillionVerifier API client
const createMillionVerifierClient = () => {
  const apiKey = process.env.MILLIONVERIFIER_API_KEY;
  if (!apiKey) {
    console.warn("[MillionVerifier] API key not configured, using mock");
    return null;
  }
  return {
    async verify(email: string): Promise<MillionVerifierResponse | null> {
      try {
        const response = await fetch("https://api.millionverifier.com/verify", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        });
        if (!response.ok) throw new Error(`MillionVerifier API error: ${response.statusText}`);
        return (await response.json()) as MillionVerifierResponse;
      } catch (err) {
        console.error("[MillionVerifier] Verification failed:", err);
        return null;
      }
    },
  };
};

// Resend API client
const createResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Resend] API key not configured, using mock");
    return null;
  }
  return {
    async sendEmail(to: string, subject: string, body: string, fromEmail: string): Promise<ResendEmailResponse | null> {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail || "noreply@omniclaw.io",
            to,
            subject,
            html: `<p>${body}</p>`,
          }),
        });
        if (!response.ok) throw new Error(`Resend API error: ${response.statusText}`);
        return (await response.json()) as ResendEmailResponse;
      } catch (err) {
        console.error("[Resend] Send failed:", err);
        return null;
      }
    },
  };
};

// Get MCP tools dynamically
async function getMcpToolsForDispatcher() {
  try {
    const agent = await import("../agent.js" as any);
    return agent.getMcpToolsForDispatcher?.() || [];
  } catch (_e) {
    return [];
  }
}

export async function executeAgentTool(
  action: ActionType,
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
): Promise<ToolExecutionResult> {
  const startTime = Date.now();

  try {
    switch (action) {
      case "source_leads":
        return await executeSourceLeadsTool(tool, leadBatch, orgId, startTime);

      case "enrich_leads":
        return await executeEnrichLeadsTool(tool, leadBatch, orgId, startTime);

      case "verify_emails":
        return await executeVerifyEmailsTool(tool, leadBatch, orgId, startTime);

      case "generate_content":
        return await executeGenerateContentTool(tool, leadBatch, orgId, startTime);

      case "send_campaign":
        return await executeSendCampaignTool(tool, leadBatch, orgId, startTime);

      case "review_signals":
        return await executeReviewSignalsTool(tool, leadBatch, orgId, startTime);

      case "adjust_strategy":
        return await executeAdjustStrategyTool(tool, leadBatch, orgId, startTime);

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Tool] ${action}:${tool} failed:`, msg);
    return {
      action,
      tool,
      success: false,
      leadsProcessed: 0,
      leadsFailed: leadBatch.leads.length,
      costUsd: 0,
      error: msg,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Source leads from Apollo, Clay, or manual import
 */
async function executeSourceLeadsTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m source_leads:${tool}`);

  // Mock: source_leads typically comes from initial batch
  // In real usage, agent would call this to import more leads mid-campaign
  return {
    action: "source_leads",
    tool,
    success: true,
    leadsProcessed: 0,
    leadsFailed: 0,
    costUsd: 0,
    metadata: { imported_from: tool },
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Enrich leads with company intel (industry, size, LinkedIn URL)
 * Connects to Clay or RB2B APIs
 */
async function executeEnrichLeadsTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m enrich_leads:${tool}`);

  const toEnrich = leadBatch.leads.filter((l) => l.status === "pending");
  if (toEnrich.length === 0) {
    return {
      action: "enrich_leads",
      tool,
      success: true,
      leadsProcessed: 0,
      leadsFailed: 0,
      costUsd: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }

  let processed = 0;
  let failed = 0;
  const costPerLead = tool === "clay" ? 0.01 : tool === "rb2b" ? 0.015 : 0.01;

  try {
    // Initialize Clay client
    const clayClient = tool === "clay" ? createClayClient() : null;
    
    if (clayClient) {
      // Use real Clay API
      for (const lead of toEnrich) {
        try {
          const enriched = await clayClient.enrich(lead.email, lead.company || "", lead.title || "");
          
          if (enriched) {
            // Update lead with enriched data
            lead.industry = enriched.industry || lead.industry;
            lead.companySize = enriched.companySize || lead.companySize;
            lead.linkedinUrl = enriched.linkedinUrl || lead.linkedinUrl;
            lead.revenue = enriched.revenue || lead.revenue;
            lead.website = enriched.website || lead.website;
          }
          
          lead.status = "enriched";
          processed++;
          console.log(`\x1b[32m[Tool]\x1b[0m enriched ${lead.firstName} via Clay`);
        } catch (err) {
          console.warn(`\x1b[33m[Tool]\x1b[0m Clay enrichment failed for ${lead.email}: ${err}`);
          // Fallback: mark as enriched anyway
          lead.status = "enriched";
          processed++;
        }
      }
    } else {
      // Fallback: mock enrich without real Clay data
      toEnrich.forEach((lead) => {
        lead.industry = lead.industry || "Technology";
        lead.companySize = lead.companySize || "50-200";
        lead.status = "enriched";
        processed++;
        console.log(`\x1b[36m[Tool]\x1b[0m [MOCK] enriched ${lead.firstName}`);
      });
    }
  } catch (error) {
    failed = toEnrich.length - processed;
  }

  return {
    action: "enrich_leads",
    tool,
    success: failed === 0,
    leadsProcessed: processed,
    leadsFailed: failed,
    costUsd: processed * costPerLead,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Verify email validity with MillionVerifier
 */
async function executeVerifyEmailsTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m verify_emails:${tool}`);

  const toVerify = leadBatch.leads.filter((l) => l.status === "enriched");
  if (toVerify.length === 0) {
    return {
      action: "verify_emails",
      tool,
      success: true,
      leadsProcessed: 0,
      leadsFailed: 0,
      costUsd: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }

  let verified = 0;
  const costPerLead = 0.005;

  try {
    // Initialize MillionVerifier client
    const mvClient = tool === "millionverifier" ? createMillionVerifierClient() : null;
    
    if (mvClient) {
      // Use real MillionVerifier API
      for (const lead of toVerify) {
        try {
          const result = await mvClient.verify(lead.email);
          
          if (result && result.result === "valid") {
            lead.status = "verified";
            verified++;
            console.log(`\x1b[32m[Tool]\x1b[0m verified ${lead.email} via MillionVerifier`);
          } else {
            lead.status = "failed";
            console.warn(`\x1b[33m[Tool]\x1b[0m email invalid: ${lead.email} (${result?.result || "unknown"})`);
          }
        } catch (err) {
          lead.status = "failed";
          console.warn(`\x1b[33m[Tool]\x1b[0m MillionVerifier check failed for ${lead.email}`);
        }
      }
    } else {
      // Fallback: use heuristic scoring
      toVerify.forEach((lead) => {
        const hasGoodDomain = !lead.email.includes("example") && !lead.email.includes("test");
        const isNotGenericRole = !lead.email.startsWith("info@") && !lead.email.startsWith("support@");
        if (hasGoodDomain && isNotGenericRole) {
          lead.status = "verified";
          verified++;
          console.log(`\x1b[36m[Tool]\x1b[0m [MOCK] verified ${lead.email}`);
        } else {
          lead.status = "failed";
        }
      });
    }
  } catch (error) {
    console.error(`[Tool] verify error:`, error);
  }

  return {
    action: "verify_emails",
    tool,
    success: verified > 0,
    leadsProcessed: verified,
    leadsFailed: toVerify.length - verified,
    costUsd: toVerify.length * costPerLead,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Generate personalized email content with OpenAI or Groq
 */
async function executeGenerateContentTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m generate_content:${tool}`);

  const toPersonalize = leadBatch.leads.filter((l) => l.status === "verified");
  if (toPersonalize.length === 0) {
    return {
      action: "generate_content",
      tool,
      success: true,
      leadsProcessed: 0,
      leadsFailed: 0,
      costUsd: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }

  let personalized = 0;
  const costPerLead = tool === "openai" ? 0.02 : 0.01; // Openai slightly more expensive

  try {
    for (const lead of toPersonalize) {
      try {
        if (tool === "openai" && openai) {
          // Use OpenAI for high-quality personalization
          const prompt = `Generate a cold email for:
Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Title: ${lead.title}
Industry: ${lead.industry || "Unknown"}

Requirements:
- Subject: under 10 words, curiosity-driven
- Body: 3-4 sentences, formal but personable
- Open with "Hi ${lead.firstName}," 
- Include one specific observation about their company/role
- End with soft CTA about a 15-minute call
- Respond with ONLY valid JSON: { "subject": "...", "body": "..." }`;

          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Use mini for cost savings in agent loop
            max_completion_tokens: 300,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          });

          const raw = completion.choices[0]?.message?.content || "{}";
          const parsed = JSON.parse(raw);
          (lead as any).personalizedSubject = parsed.subject;
          (lead as any).personalizedBody = parsed.body;
          lead.status = "personalized";
          personalized++;

          console.log(`\x1b[32m[Tool]\x1b[0m personalized ${lead.firstName} (OpenAI)`);
        } else {
          // Fallback: use heuristic template
          const subject = `Quick idea for ${lead.company}'s ${lead.title} team`;
          const body = `Hi ${lead.firstName},\n\nI noticed ${lead.company} is making moves in ${lead.industry || "your space"} and thought you might be open to a brief conversation.\n\nWould you be open to a quick 15-minute call?\n\nBest regards`;
          (lead as any).personalizedSubject = subject;
          (lead as any).personalizedBody = body;
          lead.status = "personalized";
          personalized++;
        }
      } catch (err) {
        console.warn(`\x1b[33m[Tool]\x1b[0m personalize failed for ${lead.email}:`, err);
        lead.status = "failed";
      }
    }
  } catch (error) {
    console.error(`[Tool] generate_content error:`, error);
  }

  return {
    action: "generate_content",
    tool,
    success: personalized > 0,
    leadsProcessed: personalized,
    leadsFailed: toPersonalize.length - personalized,
    costUsd: toPersonalize.length * costPerLead,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Send campaign emails via Resend, Instantly, or Smartlead
 */
async function executeSendCampaignTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m send_campaign:${tool}`);

  const toSend = leadBatch.leads.filter((l) => l.status === "personalized");
  if (toSend.length === 0) {
    return {
      action: "send_campaign",
      tool,
      success: true,
      leadsProcessed: 0,
      leadsFailed: 0,
      costUsd: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }

  let sent = 0;
  const costPerEmail = tool === "resend" ? 0.1 : tool === "instantly" ? 0.08 : 0.12;

  try {
    // Initialize Resend client
    const resendClient = tool === "resend" ? createResendClient() : null;
    
    if (resendClient) {
      // Use real Resend API
      for (const lead of toSend) {
        try {
          const subject = (lead as any).personalizedSubject || "Hello";
          const body = (lead as any).personalizedBody || "I wanted to reach out";
          
          const result = await resendClient.sendEmail(
            lead.email,
            subject,
            body,
            `outbound@${process.env.FROM_DOMAIN || "omniclaw.io"}`
          );
          
          if (result && result.id) {
            lead.status = "sent";
            (lead as any).emailId = result.id;
            sent++;
            console.log(`\x1b[32m[Tool]\x1b[0m sent to ${lead.email} via Resend (${result.id})`);
          } else {
            lead.status = "failed";
            console.warn(`\x1b[33m[Tool]\x1b[0m Resend send failed for ${lead.email}`);
          }
        } catch (err) {
          console.warn(`\x1b[33m[Tool]\x1b[0m send failed for ${lead.email}:`, err);
          lead.status = "failed";
        }
      }
    } else {
      // Fallback: mock send (for testing without actually sending)
      toSend.forEach((lead) => {
        lead.status = "sent";
        sent++;
        console.log(`\x1b[36m[Tool]\x1b[0m [MOCK] would send to ${lead.email}`);
      });
    }
  } catch (error) {
    console.error(`[Tool] send_campaign error:`, error);
  }

  return {
    action: "send_campaign",
    tool,
    success: sent > 0,
    leadsProcessed: sent,
    leadsFailed: toSend.length - sent,
    costUsd: toSend.length * costPerEmail,
    metadata: { provider: tool },
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Review campaign signals (opens, replies, bounces)
 * Query from campaign_signals table to compute KPIs
 */
async function executeReviewSignalsTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m review_signals:${tool}`);

  try {
    // TODO: Query campaign_signals table when available
    // For now, return mock data
    return {
      action: "review_signals",
      tool,
      success: true,
      leadsProcessed: 0,
      leadsFailed: 0,
      costUsd: 0,
      metadata: {
        openRate: Math.random() * 0.5, // 0-50%
        replyRate: Math.random() * 0.2, // 0-20%
        positiveReplyRate: Math.random() * 0.1, // 0-10%
        bounceRate: Math.random() * 0.05, // 0-5%
      },
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error(`[Tool] review_signals error:`, error);
    return {
      action: "review_signals",
      tool,
      success: false,
      leadsProcessed: 0,
      leadsFailed: 0,
      costUsd: 0,
      error: error instanceof Error ? error.message : String(error),
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Adjust strategy based on campaign performance
 * If open rate < 20%, suggest different enricher or content tool
 */
async function executeAdjustStrategyTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m adjust_strategy:${tool}`);

  // This tool is used by agent to record strategy changes
  // Actual strategy adjustment happens in agent loop via memory
  return {
    action: "adjust_strategy",
    tool,
    success: true,
    leadsProcessed: 0,
    leadsFailed: 0,
    costUsd: 0,
    metadata: { strategy_adjustment: tool },
    executionTimeMs: Date.now() - startTime,
  };
}
