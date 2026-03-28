import { ensureUserOrg, seedDemoDataForUser } from "../seed";

export async function onboardUserAfterLogin(userId: string, firstName?: string | null) {
  try {
    await ensureUserOrg(userId, firstName ?? undefined);
    await seedDemoDataForUser(userId);
  } catch (err) {
    console.error("Onboarding seed error:", err);
  }
}
