import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, leadsTable, agentLogsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  AiPersonalizeEmailBody,
  AiPersonalizeEmailResponse,
  AiGenerateSequenceBody,
  AiGenerateSequenceResponse,
  AiQualifyLeadBody,
  AiQualifyLeadResponse,
  AiChatBody,
  AiChatResponse,
  AiGenerateReactivationBody,
  AiGenerateReactivationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Groq inference — OpenAI-compatible, free-tier RPM is 30 req/min with no TPM cap.
// llama-3.3-70b-versatile supports JSON mode and handles all structured generation tasks.
const AI_MODEL = "llama-3.3-70b-versatile";

function safeParseJson(content: string, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return fallback;
  }
}

// Surfaces OpenAI 429 / 500 errors as proper HTTP responses instead of
// crashing the handler, and passes back Retry-After when available.
function handleOpenAIError(err: unknown, res: import("express").Response): void {
  const e = err as { status?: number; headers?: Record<string, string>; message?: string };
  if (e?.status === 429) {
    const retryAfter = e.headers?.["retry-after"] ?? "30";
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: "AI service rate limit reached. Please wait a moment and try again.", retryAfter });
    return;
  }
  if (e?.status && e.status >= 500) {
    res.status(502).json({ error: "AI service temporarily unavailable. Please try again shortly." });
    return;
  }
  res.status(500).json({ error: e?.message ?? "AI request failed." });
}

router.post("/ai/personalize", async (req, res): Promise<void> => {
  const parsed = AiPersonalizeEmailBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const leadFilter = req.orgId ? eq(leadsTable.orgId, req.orgId) : eq(leadsTable.userId, req.user!.id);
  const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, parsed.data.leadId), leadFilter));
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

  const prompt = `Generate a personalized cold email for:
Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Title: ${lead.title}
Industry: ${lead.industry || "Unknown"}
Template type: ${parsed.data.templateType}
Tone: ${parsed.data.tone || "professional"}
${parsed.data.context ? `Additional context: ${parsed.data.context}` : ""}

Respond with JSON: { "subjectLine": "...", "firstLine": "...", "body": "..." }`;

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
  } catch (err) {
    handleOpenAIError(err, res);
    return;
  }

  const content = completion.choices[0]?.message?.content || '{}';
  const result = safeParseJson(content);

  await db.insert(agentLogsTable).values({
    agentType: "outbound",
    action: "personalize_email",
    status: "completed",
    details: `Personalized email for ${lead.firstName} ${lead.lastName}`,
    userId: req.user!.id,
    orgId: req.orgId,
  });

  res.json(AiPersonalizeEmailResponse.parse(result));
});

router.post("/ai/generate-sequence", async (req, res): Promise<void> => {
  const parsed = AiGenerateSequenceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const prompt = `Generate an email sequence of ${parsed.data.numberOfEmails} emails for a ${parsed.data.campaignType} campaign.
Target audience: ${parsed.data.targetAudience}
Tone: ${parsed.data.tone || "professional"}
${parsed.data.productDescription ? `Product: ${parsed.data.productDescription}` : ""}

Respond with JSON: { "emails": [{ "order": 1, "subject": "...", "body": "...", "delay": "immediate" }, ...] }
Use delays like: "immediate", "2 days", "4 days", "7 days", etc.`;

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
  } catch (err) {
    handleOpenAIError(err, res);
    return;
  }

  const content = completion.choices[0]?.message?.content || '{"emails":[]}';
  const result = safeParseJson(content, { emails: [] });

  await db.insert(agentLogsTable).values({
    agentType: "outbound",
    action: "generate_sequence",
    status: "completed",
    details: `Generated ${parsed.data.numberOfEmails}-email sequence for ${parsed.data.campaignType}`,
    userId: req.user!.id,
    orgId: req.orgId,
  });

  res.json(AiGenerateSequenceResponse.parse(result));
});

router.post("/ai/qualify-lead", async (req, res): Promise<void> => {
  const parsed = AiQualifyLeadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const prompt = `Qualify this lead for B2B SaaS:
Company: ${parsed.data.companyName}
Size: ${parsed.data.companySize || "Unknown"}
Problem: ${parsed.data.problem || "Not specified"}
Budget: ${parsed.data.budget || "Not specified"}
Timeline: ${parsed.data.timeline || "Not specified"}

Respond with JSON: { "score": 0-100, "recommendation": "hot/warm/cold", "reasoning": "...", "nextSteps": ["step1", "step2"] }`;

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 512,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
  } catch (err) {
    handleOpenAIError(err, res);
    return;
  }

  const content = completion.choices[0]?.message?.content || '{}';
  const result = safeParseJson(content);

  res.json(AiQualifyLeadResponse.parse(result));
});

router.post("/ai/chat", async (req, res): Promise<void> => {
  const parsed = AiChatBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const systemPrompt = `You are an AI sales assistant embedded on a website. Your goals:
1. Answer questions about the company's products/services
2. Qualify visitors by understanding their needs
3. Suggest relevant solutions
4. Recommend booking a demo when appropriate

${parsed.data.knowledgeBaseContext ? `Knowledge base context:\n${parsed.data.knowledgeBaseContext}` : ""}

Be helpful, professional, and concise. If the visitor seems qualified, suggest scheduling a meeting.
Respond with JSON: { "response": "...", "qualification": { "isQualified": boolean, "score": 0-100, "suggestBooking": boolean }, "suggestedActions": ["action1"] }`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...(parsed.data.conversationHistory || []).map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: parsed.data.message },
  ];

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 768,
      messages,
      response_format: { type: "json_object" },
    });
  } catch (err) {
    handleOpenAIError(err, res);
    return;
  }

  const content = completion.choices[0]?.message?.content || '{}';
  const result = safeParseJson(content);

  res.json(AiChatResponse.parse(result));
});

router.post("/ai/reactivation", async (req, res): Promise<void> => {
  const parsed = AiGenerateReactivationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const leadFilter = req.orgId ? eq(leadsTable.orgId, req.orgId) : eq(leadsTable.userId, req.user!.id);
  const leads = await db.select().from(leadsTable).where(
    and(inArray(leadsTable.id, parsed.data.leadIds), leadFilter)
  );

  const leadSummaries = leads.map(l =>
    `- ${l.firstName} ${l.lastName}, ${l.title} at ${l.company}` +
    ` (Industry: ${l.industry || "Unknown"}` +
    `, Last contact: ${l.lastContactDate ? l.lastContactDate.toISOString().split("T")[0] : "unknown"}` +
    `, Deal stage: ${l.dealStage || "none"}` +
    `, Deal value: ${(l as any).dealValue ? `$${(l as any).dealValue.toLocaleString()}` : "unknown"}` +
    `, Lost reason: ${(l as any).lostReason || "Not recorded"}` +
    `)`
  ).join("\n");

  const prompt = `You are an expert B2B sales copywriter specializing in reactivation campaigns for dormant leads.

Generate personalized reactivation ${parsed.data.channel} messages for the following dormant leads.
${parsed.data.context ? `Campaign context / reason for reactivation: ${parsed.data.context}` : ""}

IMPORTANT INSTRUCTIONS:
- If a lead has a "Lost reason" like "Too expensive", acknowledge the concern and address it (e.g. new pricing, ROI data).
- If the lost reason is "Wrong timing", reference that timing has changed / new circumstances.
- If the lost reason is "Went with competitor", focus on differentiated value and what's improved.
- If the lost reason is "Not recorded", write a warm, curiosity-driven opener referencing their company/role.
- Each message must feel like it was written specifically for that person, not a mass email.
- Keep messages concise (3-4 sentences max) and include ONE clear call-to-action for a 15-min call.

Leads:
${leadSummaries}

Respond with JSON: { "messages": [{ "leadId": <number>, "channel": "${parsed.data.channel}", "subject": "...", "body": "..." }] }`;

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
  } catch (err) {
    handleOpenAIError(err, res);
    return;
  }

  const content = completion.choices[0]?.message?.content || '{"messages":[]}';
  const result = safeParseJson(content, { messages: [] });

  const messagesWithIds = (result.messages as Array<{ leadId?: number; channel?: string; subject?: string; body?: string }> || []).map((msg, idx: number) => ({
    leadId: msg.leadId || parsed.data.leadIds[idx],
    channel: msg.channel || parsed.data.channel,
    subject: msg.subject || "Reconnecting",
    body: msg.body || "",
  }));

  await db.insert(agentLogsTable).values({
    agentType: "reactivation",
    action: "generate_reactivation",
    status: "completed",
    details: `Generated AI reactivation messages for ${parsed.data.leadIds.length} leads`,
    userId: req.user!.id,
    orgId: req.orgId,
  });

  res.json(AiGenerateReactivationResponse.parse({ messages: messagesWithIds }));
});

export default router;
