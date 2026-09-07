import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { sessions, tenantMembers, users } from "@/server/db/schema";

export const MEMBER_SOFT_DELETE_RETENTION_DAYS = 30;
export const ADMIN_MEMBER_ROLE = "org_admin";

type Deletable = { id: string; role: string; userId: string | null };

/**
 * Splits a delete request into what may be removed and what must stay.
 *
 * The rule is "an organization always keeps at least one admin", not "admins
 * are undeletable". The previous absolute guard meant a board member who
 * resigned and asked for erasure could not be removed through any code path —
 * a right that requires database access is not a right the organization has.
 *
 * `remainingAdminCount` is the number of live admins in the org *before* this
 * request, so deleting two of three admins is allowed and deleting the last one
 * is not.
 */
function splitProtectedAdmins(members: Deletable[], remainingAdminCount: number) {
  const admins = members.filter((member) => member.role === ADMIN_MEMBER_ROLE);
  const others = members.filter((member) => member.role !== ADMIN_MEMBER_ROLE);
  const allowedAdminDeletions = Math.max(0, remainingAdminCount - 1);
  const deletableAdmins = admins.slice(0, allowedAdminDeletions);

  return {
    deletable: [...others, ...deletableAdmins],
    skippedProtectedCount: admins.length - deletableAdmins.length,
  };
}

async function countLiveAdmins(tx: Pick<typeof db, "select">, orgId: string) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        eq(tenantMembers.role, ADMIN_MEMBER_ROLE),
        ne(tenantMembers.status, "deleted"),
      ),
    );

  return row?.count ?? 0;
}

/**
 * Deletes the Better Auth identity behind a member once nothing references it.
 *
 * Purging `tenant_members` alone left the login, the password hash and — for
 * Google sign-in — a live refresh token in place forever, reachable by nobody
 * because the member row that pointed at them was gone. That is not erasure.
 *
 * Two identities are deliberately kept:
 *
 * - a user with another surviving membership, which only happens once one
 *   deployment serves several organizations (MAR-150) but must not become a
 *   cross-tenant bug the day it does;
 * - a `system_admin`, because the first-run wizard's operator account is not
 *   owned by any one membership and deleting it locks out the instance.
 *
 * `accounts` and `sessions` cascade from `users`.
 */
async function deleteOrphanedIdentities(
  tx: Pick<typeof db, "delete">,
  userIds: (string | null)[],
) {
  const candidates = [...new Set(userIds.filter((id): id is string => id != null))];

  if (candidates.length === 0) {
    return 0;
  }

  const deleted = await tx
    .delete(users)
    .where(
      and(
        inArray(users.id, candidates),
        ne(users.systemRole, "system_admin"),
        sql`not exists (
          select 1 from ${tenantMembers}
          where ${tenantMembers.userId} = ${users.id}
        )`,
      ),
    )
    .returning({ id: users.id });

  return deleted.length;
}

type SoftDeleteParams = {
  actorUserId: string;
  memberIds: string[];
  orgId: string;
};

/**
 * Tags the member as deleted and signs them out, keeping the row for
 * `MEMBER_SOFT_DELETE_RETENTION_DAYS` so an accidental deletion is recoverable.
 *
 * `userId` is deliberately kept: `getCurrentMember` already refuses a member
 * whose status is `deleted`, so nulling the column did no access-control work —
 * it only severed the one link `purgeDeletedMembers` needs to erase the login
 * thirty days later. Sessions are revoked here instead, which is what actually
 * stops them using the app.
 */
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

  return db.transaction(async (tx) => {
    const members = await tx
      .select({
        id: tenantMembers.id,
        role: tenantMembers.role,
        userId: tenantMembers.userId,
      })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.orgId, orgId),
          inArray(tenantMembers.id, memberIds),
          inArray(tenantMembers.status, ["invited", "pending", "active", "archived"]),
        ),
      );

    const { deletable, skippedProtectedCount } = splitProtectedAdmins(
      members,
      await countLiveAdmins(tx, orgId),
    );
    const skippedMissingCount = memberIds.length - members.length;

    if (deletable.length > 0) {
      const deletableIds = deletable.map((member) => member.id);

      await tx
        .update(tenantMembers)
        .set({
          status: "deleted",
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          updatedAt: new Date(),
        })
        .where(
          and(eq(tenantMembers.orgId, orgId), inArray(tenantMembers.id, deletableIds)),
        );

      // Signed out immediately rather than at purge time: the grace period is
      // for the organization's records, not for the deleted member's access.
      const userIds = deletable
        .map((member) => member.userId)
        .filter((id): id is string => id != null);

      if (userIds.length > 0) {
        await tx.delete(sessions).where(inArray(sessions.userId, userIds));
      }
    }

    return {
      deletedCount: deletable.length,
      skippedMissingCount,
      skippedProtectedCount,
    };
  });
}

/**
 * Removes members and everything hanging off them right now, with no retention
 * window. Every `tenant_members` reference either cascades or nulls, which is
 * what `purgeDeletedMembers` already relies on.
 *
 * Callers that also send the member an email must read what they need first and
 * pass it along: after this returns, the row is gone and `email_activities`
 * cannot reference it.
 */
export async function hardDeleteMembers({
  memberIds,
  orgId,
}: {
  memberIds: string[];
  orgId: string;
}) {
  if (memberIds.length === 0) {
    return { deletedCount: 0, skippedProtectedCount: 0 };
  }

  return db.transaction(async (tx) => {
    const members = await tx
      .select({
        id: tenantMembers.id,
        role: tenantMembers.role,
        userId: tenantMembers.userId,
      })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.orgId, orgId), inArray(tenantMembers.id, memberIds)));

    const { deletable, skippedProtectedCount } = splitProtectedAdmins(
      members,
      await countLiveAdmins(tx, orgId),
    );

    if (deletable.length > 0) {
      await tx
        .delete(tenantMembers)
        .where(
          and(
            eq(tenantMembers.orgId, orgId),
            inArray(
              tenantMembers.id,
              deletable.map((member) => member.id),
            ),
          ),
        );

      await deleteOrphanedIdentities(
        tx,
        deletable.map((member) => member.userId),
      );
    }

    return {
      deletedCount: deletable.length,
      skippedProtectedCount,
    };
  });
}

export async function purgeDeletedMembers() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MEMBER_SOFT_DELETE_RETENTION_DAYS);

  return db.transaction(async (tx) => {
    const membersToDelete = await tx
      .select({ id: tenantMembers.id, userId: tenantMembers.userId })
      .from(tenantMembers)
      .where(
        and(eq(tenantMembers.status, "deleted"), lt(tenantMembers.deletedAt, cutoff)),
      );

    if (membersToDelete.length === 0) {
      return {
        deletedCount: 0,
        deletedIdentityCount: 0,
        cutoffIso: cutoff.toISOString(),
      };
    }

    await tx.delete(tenantMembers).where(
      inArray(
        tenantMembers.id,
        membersToDelete.map((member) => member.id),
      ),
    );

    // After the member rows are gone, so the "nothing references this user"
    // check sees the state the purge is leaving behind rather than the one it
    // started from.
    const deletedIdentityCount = await deleteOrphanedIdentities(
      tx,
      membersToDelete.map((member) => member.userId),
    );

    return {
      deletedCount: membersToDelete.length,
      deletedIdentityCount,
      cutoffIso: cutoff.toISOString(),
    };
  });
}
