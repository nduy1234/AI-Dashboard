import "dotenv/config";
import { db, usersTable } from "@workspace/db";

async function test() {
  try {
    const userData = {
      id: "8990767d-d777-4bc9-a6dc-cbf87252e1b1",
      email: "muhammadarslantoor@gmail.com",
      firstName: "Muhammad Arslan",
      lastName: "Toor",
      profileImageUrl: "https://lh3.googleusercontent.com/...?s96-c",
    };

    console.log("Attempting insert...");
    await db
      .insert(usersTable)
      .values(userData)
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { ...userData, updatedAt: new Date() },
      });
      
    console.log("Insert success!");
  } catch (err: any) {
    console.error("EXACT ERROR MESSAGE:", err.message);
    if (err.code) console.error("POSTGRES ERROR CODE:", err.code);
    if (err.detail) console.error("POSTGRES ERROR DETAIL:", err.detail);
  }
}

test().catch(console.error);
