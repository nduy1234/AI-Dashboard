import { eq, type SQL } from "drizzle-orm";

export interface OwnerContext {
  userId: string;
  orgId: number | null;
}

export function getOwnerContext(req: Express.Request): OwnerContext {
  return {
    userId: req.user!.id,
    orgId: req.orgId ?? null,
  };
}

type OwnerScopedTable = {
  userId: unknown;
  orgId: unknown;
};

export function ownerScope(table: OwnerScopedTable, owner: OwnerContext): SQL<unknown> {
  return owner.orgId !== null
    ? eq((table as unknown as { orgId: never }).orgId, owner.orgId)
    : eq((table as unknown as { userId: never }).userId, owner.userId);
}
