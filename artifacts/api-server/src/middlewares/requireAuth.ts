import { type Request, type Response, type NextFunction } from "express";
import { db, orgMembershipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [membership] = await db.select().from(orgMembershipsTable)
    .where(eq(orgMembershipsTable.userId, req.user.id));
  if (membership) {
    req.orgId = membership.orgId;
  }

  next();
}
