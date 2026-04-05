import Groq from "groq-sdk";

let _client: Groq | null = null;

export function getGroqClient(): Groq {
  if (!_client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");
    _client = new Groq({ apiKey });
  }
  return _client;
}

export function isGroqAvailable(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export async function generatePersonalizedEmail(params: {
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  industry?: string | null;
  companySize?: string | null;
  linkedinUrl?: string | null;
  bookingUrl?: string | null;
}): Promise<{ subject: string; body: string }> {
  const client = getGroqClient();

  const ctaInstruction = params.bookingUrl
    ? `- End with a clear CTA to book a 15-minute call using this exact link: ${params.bookingUrl}`
    : `- One clear CTA: offer a 15-minute call`;

  const prompt = `You are an expert B2B cold email copywriter. Write a short, formal, personalized cold email.

Lead info:
- Name: ${params.firstName} ${params.lastName}
- Title: ${params.title}
- Company: ${params.company}
- Industry: ${params.industry ?? "Unknown"}
- Company size: ${params.companySize ?? "Unknown"}
- LinkedIn: ${params.linkedinUrl ?? "Not available"}

Requirements:
- Subject line: under 10 words, curiosity-driven, no clickbait
- Email body: formal but approachable tone, 3-4 sentences max, no buzzwords
- MUST open with a formal greeting on its own line: "Hi ${params.firstName}," or "Hello ${params.firstName},"
- Second line: one specific observation about ${params.company} or their role as ${params.title}
- Third line: one clear value proposition relevant to their industry
${ctaInstruction}
- Close with "Best regards," on its own line (no sign-off name needed)
- Do NOT use "I hope this email finds you well", "I wanted to reach out", or similar filler openers

Respond with ONLY valid JSON (no markdown):
{ "subject": "...", "body": "..." }`;

  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { subject?: string; body?: string };

  return {
    subject: parsed.subject ?? `Quick idea for ${params.company}`,
    body: parsed.body ?? "",
  };
}
