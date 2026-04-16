import { and, eq, inArray, lt } from "drizzle-orm";

import { db } from "@/server/db";
import { tenantMembers } from "@/server/db/schema";

export const MEMBER_SOFT_DELETE_RETENTION_DAYS = 30;
export const PROTECTED_MEMBER_ROLE = "org_admin";

type SoftDeleteParams = {
  actorUserId: string;
  memberIds: string[];
  orgId: string;
};

export async function softDeleteMembers({
  actorUserId,
  memberIds,
  orgId,
}: SoftDeleteParams) {
  if (memberIds.length === 0) {
    return {
      deletedCount: 0,
      skippedMissingCount: 0,
      skippedProtectedCount: 0,
    };
  }

  const members = await db
    .select({
      id: tenantMembers.id,
      role: tenantMembers.role,
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        inArray(tenantMembers.id, memberIds),
        inArray(tenantMembers.status, ["invited", "pending", "active", "archived"]),
      ),
    );

  const deletableIds = members
    .filter((member) => member.role !== PROTECTED_MEMBER_ROLE)
    .map((member) => member.id);
  const skippedProtectedCount = members.filter(
    (member) => member.role === PROTECTED_MEMBER_ROLE,
  ).length;
  const skippedMissingCount = memberIds.length - members.length;

  if (deletableIds.length > 0) {
    await db
      .update(tenantMembers)
      .set({
        status: "deleted",
        deletedAt: new Date(),
        deletedByUserId: actorUserId,
        userId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantMembers.orgId, orgId),
          inArray(tenantMembers.id, deletableIds),
        ),
      );
  }

  return {
    deletedCount: deletableIds.length,
    skippedMissingCount,
    skippedProtectedCount,
  };
}

export async function purgeDeletedMembers() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MEMBER_SOFT_DELETE_RETENTION_DAYS);

  const membersToDelete = await db
    .select({ id: tenantMembers.id })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.status, "deleted"),
        lt(tenantMembers.deletedAt, cutoff),
      ),
    );

  if (membersToDelete.length === 0) {
    return {
      deletedCount: 0,
      cutoffIso: cutoff.toISOString(),
    };
  }

  await db
    .delete(tenantMembers)
    .where(inArray(tenantMembers.id, membersToDelete.map((member) => member.id)));

  return {
    deletedCount: membersToDelete.length,
    cutoffIso: cutoff.toISOString(),
  };
}
