import { db, leadsTable, campaignsTable, emailAccountsTable, integrationsTable, agentLogsTable, knowledgeBaseDocsTable, promptTemplatesTable, organizationsTable, orgMembershipsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

export async function ensureUserOrg(userId: string, userName?: string): Promise<number> {
  const [existing] = await db.select().from(orgMembershipsTable).where(eq(orgMembershipsTable.userId, userId));
  if (existing) return existing.orgId;

  const orgName = userName ? `${userName}'s Workspace` : "My Workspace";
  const slug = `org-${userId.slice(0, 8)}`;
  const [org] = await db.insert(organizationsTable).values({ name: orgName, slug, ownerId: userId }).returning();
  await db.insert(orgMembershipsTable).values({ orgId: org.id, userId, role: "owner" });
  return org.id;
}

export async function seedDemoDataForUser(userId: string) {
  const [existingLead] = await db.select({ count: sql<number>`count(*)::int` }).from(leadsTable).where(eq(leadsTable.userId, userId));
  if ((existingLead?.count ?? 0) > 0) return;

  const orgId = await ensureUserOrg(userId);

  await db.insert(leadsTable).values([
    { firstName: "Sarah", lastName: "Chen", email: "sarah.chen@techcorp.com", company: "TechCorp Inc", title: "VP of Sales", status: "qualified", source: "apollo", industry: "Technology", companySize: "200-500", engagementScore: 85, verified: true, userId, orgId },
    { firstName: "Michael", lastName: "Rodriguez", email: "m.rodriguez@globalfin.com", company: "GlobalFin", title: "CTO", status: "contacted", source: "apollo", industry: "Finance", companySize: "500-1000", engagementScore: 72, verified: true, userId, orgId },
    { firstName: "Emily", lastName: "Thompson", email: "emily@startuplab.io", company: "StartupLab", title: "Head of Growth", status: "new", source: "apollo", industry: "SaaS", companySize: "50-200", engagementScore: 45, verified: true, userId, orgId },
    { firstName: "David", lastName: "Kim", email: "david.kim@megacorp.com", company: "MegaCorp", title: "Director of Marketing", status: "replied", source: "linkedin", industry: "Enterprise Software", companySize: "1000+", engagementScore: 91, verified: true, userId, orgId },
    { firstName: "Jessica", lastName: "Williams", email: "j.williams@acme.co", company: "Acme Solutions", title: "CEO", status: "meeting_booked", source: "referral", industry: "Consulting", companySize: "10-50", engagementScore: 95, verified: true, userId, orgId },
    { firstName: "Robert", lastName: "Martinez", email: "rob@cloudnative.dev", company: "CloudNative Dev", title: "Engineering Lead", status: "new", source: "website", industry: "Cloud Infrastructure", companySize: "50-200", engagementScore: 33, verified: false, userId, orgId },
    { firstName: "Amanda", lastName: "Lee", email: "amanda.lee@datawise.ai", company: "DataWise AI", title: "COO", status: "qualified", source: "reactivation", industry: "AI/ML", companySize: "200-500", engagementScore: 78, verified: true, userId, orgId },
    { firstName: "James", lastName: "Brown", email: "jbrown@retailpro.com", company: "RetailPro", title: "VP Operations", status: "contacted", source: "reactivation", industry: "Retail Tech", companySize: "500-1000", engagementScore: 62, verified: true, userId, orgId },
    { firstName: "Lisa", lastName: "Johnson", email: "lisa@webflow.agency", company: "WebFlow Agency", title: "Managing Director", status: "new", source: "website", industry: "Digital Marketing", companySize: "10-50", engagementScore: 50, verified: false, userId, orgId },
    { firstName: "Chris", lastName: "Taylor", email: "chris.t@scaleuphq.com", company: "ScaleUp HQ", title: "Founder", status: "replied", source: "website", industry: "Venture Capital", companySize: "10-50", engagementScore: 88, verified: true, userId, orgId },
  ]);

  await db.insert(campaignsTable).values([
    { name: "Q1 Enterprise Outbound", type: "outbound", status: "active", subject: "Transform Your Revenue Pipeline", emailSequenceCount: 5, leadCount: 250, sentCount: 1200, openCount: 480, replyCount: 96, meetingsBooked: 24, launchedAt: new Date("2026-01-15"), userId, orgId },
    { name: "SaaS Decision Makers", type: "outbound", status: "active", subject: "AI-Powered Growth for SaaS", emailSequenceCount: 4, leadCount: 180, sentCount: 720, openCount: 324, replyCount: 72, meetingsBooked: 18, launchedAt: new Date("2026-02-01"), userId, orgId },
    { name: "Lost Deal Reactivation - Q4", type: "reactivation", status: "completed", subject: "New Features You'll Love", emailSequenceCount: 3, leadCount: 120, sentCount: 360, openCount: 180, replyCount: 54, meetingsBooked: 12, launchedAt: new Date("2025-12-01"), userId, orgId },
    { name: "Dormant Lead Revival", type: "reactivation", status: "active", subject: "We've Been Thinking About You", emailSequenceCount: 3, leadCount: 95, sentCount: 285, openCount: 114, replyCount: 34, meetingsBooked: 8, launchedAt: new Date("2026-02-15"), userId, orgId },
    { name: "Website Visitor Follow-up", type: "conversion", status: "draft", subject: "Thanks for Visiting!", emailSequenceCount: 2, leadCount: 0, sentCount: 0, openCount: 0, replyCount: 0, meetingsBooked: 0, userId, orgId },
  ]);

  await db.insert(emailAccountsTable).values([
    { email: "outreach@company.com", provider: "instantly", status: "active", dailyLimit: 50, sentToday: 23, warmupEnabled: true, reputation: 98.5, userId, orgId },
    { email: "sales@company.com", provider: "instantly", status: "active", dailyLimit: 40, sentToday: 15, warmupEnabled: true, reputation: 96.2, userId, orgId },
    { email: "growth@company.com", provider: "instantly", status: "warming", dailyLimit: 20, sentToday: 8, warmupEnabled: true, reputation: 85.0, userId, orgId },
  ]);

  await db.insert(integrationsTable).values([
    { name: "Apollo", type: "apollo", status: "connected", category: "lead_sourcing", description: "B2B lead database and prospecting platform", apiKeyConfigured: true, userId, orgId },
    { name: "MillionVerifier", type: "millionverifier", status: "connected", category: "email_verification", description: "Email verification and validation service", apiKeyConfigured: true, userId, orgId },
    { name: "Instantly", type: "instantly", status: "connected", category: "email_sending", description: "Cold email automation and sending platform", apiKeyConfigured: true, userId, orgId },
    { name: "Mailwarm", type: "mailwarm", status: "connected", category: "domain_warmup", description: "Email domain warm-up service", apiKeyConfigured: true, userId, orgId },
    { name: "GoHighLevel", type: "gohighlevel", status: "disconnected", category: "crm", description: "All-in-one CRM and marketing platform", userId, orgId },
    { name: "HubSpot", type: "hubspot", status: "connected", category: "crm", description: "CRM, marketing, and sales platform", apiKeyConfigured: true, userId, orgId },
    { name: "Calendly", type: "calendly", status: "connected", category: "booking", description: "Meeting scheduling and booking platform", apiKeyConfigured: true, userId, orgId },
    { name: "Tidio", type: "tidio", status: "disconnected", category: "chat", description: "Live chat and chatbot platform", userId, orgId },
  ]);

  await db.insert(agentLogsTable).values([
    { agentType: "outbound", action: "lead_sourcing", status: "completed", details: "Sourced 50 leads from Apollo matching ICP criteria", userId, orgId },
    { agentType: "outbound", action: "email_verification", status: "completed", details: "Verified 48/50 emails via MillionVerifier", userId, orgId },
    { agentType: "outbound", action: "personalize_email", status: "completed", details: "Generated personalized emails for 48 verified leads", userId, orgId },
    { agentType: "outbound", action: "send_campaign", status: "completed", details: "Launched Q1 Enterprise Outbound campaign", userId, orgId },
    { agentType: "reactivation", action: "crm_import", status: "completed", details: "Imported 120 dormant leads from HubSpot", userId, orgId },
    { agentType: "reactivation", action: "generate_reactivation", status: "completed", details: "Generated reactivation sequences for 95 leads", userId, orgId },
    { agentType: "conversion", action: "chat_interaction", status: "completed", details: "Qualified website visitor from TechCorp", userId, orgId },
    { agentType: "conversion", action: "booking_scheduled", status: "completed", details: "Auto-scheduled demo with qualified lead", userId, orgId },
  ]);

  await db.insert(knowledgeBaseDocsTable).values([
    { title: "Product Overview", type: "documentation", content: "Our AI Revenue Platform helps B2B companies automate their entire revenue pipeline through three autonomous agents: Outbound, Reactivation, and Conversion.", userId, orgId },
    { title: "Pricing FAQ", type: "faq", content: "Q: What are your pricing tiers?\nA: We offer Starter ($499/mo), Growth ($999/mo), and Enterprise (custom pricing) plans.\n\nQ: Is there a free trial?\nA: Yes, we offer a 14-day free trial with full access to all features.", userId, orgId },
    { title: "Integration Guide", type: "documentation", content: "Our platform integrates with Apollo, MillionVerifier, Instantly, Mailwarm, GoHighLevel, HubSpot, Calendly, and Tidio. API keys can be configured in the Integrations settings.", userId, orgId },
  ]);

  await db.insert(promptTemplatesTable).values([
    { name: "Cold Outreach - First Touch", type: "outbound", template: "Hi {{firstName}},\n\nI noticed {{company}} is {{observation}}. We help companies like yours {{valueProposition}}.\n\nWould you be open to a quick 15-minute call this week?\n\nBest,\n{{senderName}}", userId, orgId },
    { name: "Follow-up - No Reply", type: "outbound", template: "Hi {{firstName}},\n\nJust wanted to bump this to the top of your inbox. I understand you're busy at {{company}}.\n\n{{oneLineValue}}\n\nWorth a quick chat?\n\n{{senderName}}", userId, orgId },
    { name: "Reactivation - Lost Deal", type: "reactivation", template: "Hi {{firstName}},\n\nWe last connected about {{previousTopic}}. Since then, we've {{newDevelopment}}.\n\nI'd love to show you what's changed. Do you have 15 minutes this week?\n\nBest,\n{{senderName}}", userId, orgId },
    { name: "Website Chat - Qualifier", type: "conversion", template: "Thanks for visiting! I'd love to help you find the right solution.\n\nCould you tell me a bit about:\n1. Your company size\n2. The main challenge you're looking to solve\n3. Your timeline for implementation\n\nThis will help me point you in the right direction!", userId, orgId },
  ]);

  console.log(`Database seeded with demo data for user ${userId} in org ${orgId}`);
}

export async function seedDatabase() {
}
