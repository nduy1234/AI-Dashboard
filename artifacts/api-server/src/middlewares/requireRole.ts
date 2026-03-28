import { type NextFunction, type Request, type Response } from "express";
import { db, orgMembershipsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export function requireOrgRole(allowedRoles: string[]) {
  return async function roleMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!req.orgId) {
      next();
      return;
    }

    const [membership] = await db
      .select()
      .from(orgMembershipsTable)
      .where(and(eq(orgMembershipsTable.orgId, req.orgId), eq(orgMembershipsTable.userId, req.user.id)));

    if (!membership || !allowedRoles.includes(membership.role)) {
      res.status(403).json({ error: "Insufficient role permissions" });
      return;
    }

    next();
  };
}
