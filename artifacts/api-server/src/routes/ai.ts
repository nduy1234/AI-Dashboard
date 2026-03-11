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

router.post("/ai/personalize", async (req, res): Promise<void> => {
  const parsed = AiPersonalizeEmailBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, parsed.data.leadId), eq(leadsTable.userId, req.user!.id)));
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

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content || '{}';
  const result = JSON.parse(content);

  await db.insert(agentLogsTable).values({
    agentType: "outbound",
    action: "personalize_email",
    status: "completed",
    details: `Personalized email for ${lead.firstName} ${lead.lastName}`,
    userId: req.user?.id,
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

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content || '{"emails":[]}';
  const result = JSON.parse(content);

  await db.insert(agentLogsTable).values({
    agentType: "outbound",
    action: "generate_sequence",
    status: "completed",
    details: `Generated ${parsed.data.numberOfEmails}-email sequence for ${parsed.data.campaignType}`,
    userId: req.user?.id,
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

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content || '{}';
  const result = JSON.parse(content);

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

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 8192,
    messages,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content || '{}';
  const result = JSON.parse(content);

  res.json(AiChatResponse.parse(result));
});

router.post("/ai/reactivation", async (req, res): Promise<void> => {
  const parsed = AiGenerateReactivationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const leads = await db.select().from(leadsTable).where(
    and(inArray(leadsTable.id, parsed.data.leadIds), eq(leadsTable.userId, req.user!.id))
  );

  const allMessages = [];
  for (const leadId of parsed.data.leadIds) {
    const lead = leads.find(l => l.id === leadId) || { firstName: "Contact", lastName: "", company: "Company", title: "Professional" };
    allMessages.push({
      leadId,
      channel: parsed.data.channel,
      subject: `Re-engage with ${lead.firstName} - New Opportunity`,
      body: `Hi ${lead.firstName},\n\nI noticed we previously connected regarding your needs at ${lead.company}. Since then, we've made significant improvements that I think would be valuable for you.\n\nWould you be open to a quick 15-minute call to explore how we can help?\n\nBest regards`,
    });
  }

  await db.insert(agentLogsTable).values({
    agentType: "reactivation",
    action: "generate_reactivation",
    status: "completed",
    details: `Generated reactivation messages for ${parsed.data.leadIds.length} leads`,
    userId: req.user?.id,
  });

  res.json(AiGenerateReactivationResponse.parse({ messages: allMessages }));
});

export default router;
