import { db, usersTable } from "@workspace/db";
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
