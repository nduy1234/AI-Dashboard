import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function generateDeterministicUuid(seed: string): string {
  const hash = crypto.createHash("md5").update(seed).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function upsertUserFromClaims(claims: Record<string, unknown>) {
  const userData = {
    id: generateDeterministicUuid(claims.sub as string),
    email: (claims.email as string) || null,
    firstName: (claims.given_name as string) || null,
    lastName: (claims.family_name as string) || null,
    profileImageUrl: (claims.picture as string) || null,
    // Google-verified emails are always considered confirmed.
    emailVerified: true,
  };

  const [user] = await db
    .insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        ...userData,
        updatedAt: new Date(),
      },
    })
    .returning();

  return user;
}

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));
  return user ?? null;
}

export async function createEmailUser(data: {
  email: string;
  passwordHash: string;
  firstName?: string | null;
  lastName?: string | null;
  emailVerificationToken: string;
  emailVerificationTokenExpiry: Date;
}) {
  const [user] = await db
    .insert(usersTable)
    .values({
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      emailVerified: false,
      emailVerificationToken: data.emailVerificationToken,
      emailVerificationTokenExpiry: data.emailVerificationTokenExpiry,
    })
    .returning();
  return user;
}

export async function updateUserOtp(
  userId: string,
  token: string,
  expiry: Date,
) {
  const [user] = await db
    .update(usersTable)
    .set({
      emailVerificationToken: token,
      emailVerificationTokenExpiry: expiry,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId))
    .returning();
  return user;
}

export async function markEmailVerified(userId: string) {
  const [user] = await db
    .update(usersTable)
    .set({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId))
    .returning();
  return user;
}
