import {
  db,
  domainPoolStateTable,
  integrationsTable,
  orgMembershipsTable,
  organizationsTable,
  providerAccountsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { ensureUserOrg } from "./seed";

type ProviderSeed = {
  provider: "resend" | "instantly" | "smartlead";
  accountLabel: string;
  status: "active" | "paused";
  config: Record<string, unknown>;
};

const defaultProviders: ProviderSeed[] = [
  {
    provider: "resend",
    accountLabel: "resend-primary",
    status: "active",
    config: { region: "us-east-1", mode: "transactional" },
  },
  {
    provider: "instantly",
    accountLabel: "instantly-pool-a",
    status: "active",
    config: { workspace: "outbound", mode: "bulk" },
  },
  {
    provider: "smartlead",
    accountLabel: "smartlead-pool-a",
    status: "paused",
    config: { workspace: "backup", mode: "bulk" },
  },
];

const defaultDomains = [
  { domain: "mail.yourcompany.com", dailyLimit: 40, healthScore: 95, warmupEnabled: true },
  { domain: "hello.yourcompany.com", dailyLimit: 35, healthScore: 92, warmupEnabled: true },
  { domain: "team.yourcompany.com", dailyLimit: 30, healthScore: 90, warmupEnabled: true },
];

async function resolveContext(userId: string): Promise<{ orgId: number }> {
  const [membership] = await db.select().from(orgMembershipsTable).where(eq(orgMembershipsTable.userId, userId));
  if (membership) return { orgId: membership.orgId };

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.ownerId, userId));
  if (org) {
    await db.insert(orgMembershipsTable).values({
      orgId: org.id,
      userId,
      role: "owner",
    });
    return { orgId: org.id };
  }

  const orgId = await ensureUserOrg(userId, "Phase 1.1 Ops");
  return { orgId };
}

async function upsertIntegration(
  userId: string,
  orgId: number,
  item: { name: string; type: string; category: string; description: string },
): Promise<void> {
  const [existing] = await db
    .select()
    .from(integrationsTable)
    .where(and(eq(integrationsTable.type, item.type), eq(integrationsTable.orgId, orgId)));

  if (existing) {
    await db
      .update(integrationsTable)
      .set({
        status: "connected",
        apiKeyConfigured: true,
        description: item.description,
      })
      .where(eq(integrationsTable.id, existing.id));
    return;
  }

  await db.insert(integrationsTable).values({
    name: item.name,
    type: item.type,
    category: item.category,
    description: item.description,
    status: "connected",
    apiKeyConfigured: true,
    userId,
    orgId,
  });
}

async function seedProviderAccounts(userId: string, orgId: number): Promise<void> {
  for (const provider of defaultProviders) {
    const [existing] = await db
      .select()
      .from(providerAccountsTable)
      .where(
        and(
          eq(providerAccountsTable.orgId, orgId),
          eq(providerAccountsTable.provider, provider.provider),
          eq(providerAccountsTable.accountLabel, provider.accountLabel),
        ),
      );

    if (existing) {
      await db
        .update(providerAccountsTable)
        .set({ status: provider.status, config: provider.config })
        .where(eq(providerAccountsTable.id, existing.id));
      continue;
    }

    await db.insert(providerAccountsTable).values({
      provider: provider.provider,
      accountLabel: provider.accountLabel,
      status: provider.status,
      config: provider.config,
      userId,
      orgId,
    });
  }
}

async function seedDomainPool(userId: string, orgId: number): Promise<void> {
  const providerAccounts = await db
    .select()
    .from(providerAccountsTable)
    .where(and(eq(providerAccountsTable.orgId, orgId), eq(providerAccountsTable.provider, "resend")));
  const preferredProviderAccountId = providerAccounts[0]?.id ?? null;

  for (const domain of defaultDomains) {
    const [existing] = await db
      .select()
      .from(domainPoolStateTable)
      .where(and(eq(domainPoolStateTable.orgId, orgId), eq(domainPoolStateTable.domain, domain.domain)));

    if (existing) {
      await db
        .update(domainPoolStateTable)
        .set({
          healthScore: domain.healthScore,
          dailyLimit: domain.dailyLimit,
          warmupEnabled: domain.warmupEnabled,
          providerAccountId: preferredProviderAccountId,
        })
        .where(eq(domainPoolStateTable.id, existing.id));
      continue;
    }

    await db.insert(domainPoolStateTable).values({
      domain: domain.domain,
      providerAccountId: preferredProviderAccountId,
      healthScore: domain.healthScore,
      warmupEnabled: domain.warmupEnabled,
      dailyLimit: domain.dailyLimit,
      sentToday: 0,
      userId,
      orgId,
    });
  }
}

export async function seedPhase11Operationalization(userId: string): Promise<void> {
  const { orgId } = await resolveContext(userId);

  await Promise.all([
    upsertIntegration(userId, orgId, {
      name: "Apollo",
      type: "apollo",
      category: "lead_sourcing",
      description: "Lead sourcing via export/API fallback",
    }),
    upsertIntegration(userId, orgId, {
      name: "Clay",
      type: "clay",
      category: "enrichment",
      description: "Enrichment waterfall and recent-news signals",
    }),
    upsertIntegration(userId, orgId, {
      name: "MillionVerifier",
      type: "millionverifier",
      category: "email_verification",
      description: "Email verification gate before outbound send",
    }),
    upsertIntegration(userId, orgId, {
      name: "Resend",
      type: "resend",
      category: "email_sending",
      description: "Programmatic sending fallback and pilot sender",
    }),
    upsertIntegration(userId, orgId, {
      name: "HubSpot",
      type: "hubspot",
      category: "crm",
      description: "CRM source of truth and optimization feedback sink",
    }),
    upsertIntegration(userId, orgId, {
      name: "Cal.com",
      type: "calcom",
      category: "booking",
      description: "Scheduling API for conversion-ready leads",
    }),
    upsertIntegration(userId, orgId, {
      name: "RB2B",
      type: "rb2b",
      category: "visitor_identification",
      description: "Inbound visitor deanonymization signal source",
    }),
    upsertIntegration(userId, orgId, {
      name: "Slack",
      type: "slack",
      category: "notifications",
      description: "Sales rep alerts for positive replies and meetings booked",
    }),
    upsertIntegration(userId, orgId, {
      name: "Cal.com",
      type: "calcom",
      category: "meeting_booking",
      description: "Inbound meeting booking conversion tracking",
    }),
  ]);

  await seedProviderAccounts(userId, orgId);
  await seedDomainPool(userId, orgId);

  // eslint-disable-next-line no-console
  console.log(
    `Phase 1.1 operationalization completed for user ${userId} (org ${orgId}).`,
  );
}

async function main(): Promise<void> {
  const userId = process.env.SEED_USER_ID;
  if (!userId) {
    throw new Error("SEED_USER_ID is required");
  }
  await seedPhase11Operationalization(userId);
}

if (process.argv[1]?.endsWith("seedPhase11Operationalization.ts")) {
  void main();
}
