import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  WorkspaceNotConnectedError,
  deleteWorkspaceUser,
} from "@/server/lib/workspace/client";
import {
  sessions,
  tenantMembers,
  users,
  type MemberDeletionReason,
  type MembershipStatus,
} from "@/server/db/schema";

export const MEMBER_SOFT_DELETE_RETENTION_DAYS = 30;
export const ADMIN_MEMBER_ROLE = "org_admin";

type Deletable = {
  id: string;
  role: string;
  userId: string | null;
  /** Only the soft-delete path reads this — it is what `previousStatus` is set
   *  from. `hardDeleteMembers` has nothing to restore to and omits it. */
  status?: MembershipStatus;
};

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
  /** Defaults to an administrator acting on the roster, which is every caller
   *  today. Passed explicitly by anything that is not that. */
  reason?: MemberDeletionReason;
  /** Overrides the default retention window for this deletion only. */
  retentionDays?: number;
};

/**
 * Tags the member as deleted and signs them out, keeping the row until
 * `purgeAfter` so an accidental deletion is recoverable.
 *
 * The window is stamped onto the row rather than recomputed from `deletedAt`
 * at purge time. Shortening `MEMBER_SOFT_DELETE_RETENTION_DAYS` must not
 * retroactively erase people whose grace period was already promised to them
 * in writing, and a single member can be held longer without a config change.
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
  reason = "admin_request",
  retentionDays = MEMBER_SOFT_DELETE_RETENTION_DAYS,
}: SoftDeleteParams) {
  if (memberIds.length === 0) {
    return {
      deletedCount: 0,
      deletedMemberIds: [] as string[],
      skippedMissingCount: 0,
      skippedProtectedCount: 0,
      purgeAfter: null as Date | null,
    };
  }

  const now = new Date();
  const purgeAfter = new Date(now);
  purgeAfter.setDate(purgeAfter.getDate() + retentionDays);

  return db.transaction(async (tx) => {
    const members = await tx
      .select({
        id: tenantMembers.id,
        role: tenantMembers.role,
        userId: tenantMembers.userId,
        status: tenantMembers.status,
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
      // `previousStatus` differs per member, so this cannot be one blanket
      // UPDATE. Restoring an archived member to `active` would quietly put them
      // back on the billing roster, which is the whole reason the column exists.
      for (const member of deletable) {
        await tx
          .update(tenantMembers)
          .set({
            status: "deleted",
            previousStatus: member.status ?? null,
            deletedAt: now,
            deletedByUserId: actorUserId,
            deletionReason: reason,
            purgeAfter,
            updatedAt: now,
          })
          .where(
            and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.id, member.id)),
          );
      }

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
      // Which members were actually deleted, not just how many. A bulk delete
      // skips protected admins and already-deleted rows, and the notification
      // must not go to somebody whose membership is still live.
      deletedMemberIds: deletable.map((member) => member.id),
      skippedMissingCount,
      skippedProtectedCount,
      // Returned so the caller can tell the member the date without
      // re-reading the row it just wrote.
      purgeAfter: deletable.length > 0 ? purgeAfter : null,
    };
  });
}

/**
 * Undoes a soft delete, putting the member back in the status they held.
 *
 * `previousStatus` is what makes this safe. Restoring everybody to `active`
 * would put an archived member back on the billing roster and un-suspend a
 * member somebody suspended deliberately. Rows deleted before migration 0058
 * have no `previousStatus` to return to — those restore to `suspended`, which
 * is the one status that is visible, harmless and obviously in need of a human
 * decision.
 *
 * Sessions are not resurrected. They were revoked at delete time and the member
 * signs in again, which is also the cheapest way to be sure a restored member's
 * access is rebuilt from their current role rather than a stale token.
 */
export async function restoreMembers({
  memberIds,
  orgId,
}: {
  memberIds: string[];
  orgId: string;
}) {
  if (memberIds.length === 0) {
    return { restoredCount: 0, skippedMissingCount: 0, conflictedEmails: [] as string[] };
  }

  return db.transaction(async (tx) => {
    const members = await tx
      .select({
        id: tenantMembers.id,
        email: tenantMembers.email,
        previousStatus: tenantMembers.previousStatus,
      })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.orgId, orgId),
          inArray(tenantMembers.id, memberIds),
          eq(tenantMembers.status, "deleted"),
        ),
      );

    // The one collision restore can actually hit. `tenant_members_org_user_idx`
    // is unique and covers deleted rows, so a linked user cannot have gained a
    // second membership in the meantime — but email is only a plain index, and
    // `findTenantMemberByEmail` skips deleted rows, so the same person may have
    // re-registered during the grace window. Restoring would then leave two live
    // records for one human, which is worse than refusing.
    const emails = members
      .map((member) => member.email)
      .filter((email): email is string => email != null);

    const liveWithSameEmail = emails.length === 0
      ? []
      : await tx
          .select({ email: tenantMembers.email })
          .from(tenantMembers)
          .where(
            and(
              eq(tenantMembers.orgId, orgId),
              ne(tenantMembers.status, "deleted"),
              inArray(tenantMembers.email, emails),
            ),
          );

    const takenEmails = new Set(
      liveWithSameEmail
        .map((row) => row.email?.toLowerCase())
        .filter((email): email is string => email != null),
    );

    const restorable = members.filter(
      (member) => member.email == null || !takenEmails.has(member.email.toLowerCase()),
    );

    const now = new Date();

    for (const member of restorable) {
      await tx
        .update(tenantMembers)
        .set({
          status: member.previousStatus ?? "suspended",
          previousStatus: null,
          deletedAt: null,
          deletedByUserId: null,
          deletionReason: null,
          purgeAfter: null,
          workspacePurgeAttempts: 0,
          workspacePurgeLastError: null,
          updatedAt: now,
        })
        .where(and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.id, member.id)));
    }

    return {
      restoredCount: restorable.length,
      skippedMissingCount: memberIds.length - members.length,
      // Reported rather than swallowed: the admin has to merge or rename the
      // live record before this one can come back, and only they can decide
      // which of the two is the real member.
      conflictedEmails: members
        .filter((member) => !restorable.includes(member))
        .map((member) => member.email)
        .filter((email): email is string => email != null),
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

/**
 * How many times the purge will try to delete a member's Workspace account
 * before giving up on that member.
 *
 * Retrying forever would be invisible; erasing the row instead would strand a
 * live Google account with nothing left pointing at it. So after this many
 * failures the member is reported as stalled and left alone for a human.
 */
export const MAX_WORKSPACE_PURGE_ATTEMPTS = 5;

type PurgeCandidate = {
  id: string;
  orgId: string;
  userId: string | null;
  workspaceUserId: string | null;
  workspaceUserEmail: string | null;
  workspacePurgeAttempts: number;
};

/**
 * Deletes one member's Workspace account, if they have one.
 *
 * Returns whether the member row may now be erased. The ordering this enforces
 * is the whole point: the member row is the only record that a Workspace
 * account still needs deleting, so it must outlive a failed delete. Erasing the
 * row first and calling Google second means one timeout strands a live account,
 * with a mailbox and a refresh token, that nothing in the system can ever find
 * again.
 */
async function disposeWorkspaceAccount(member: PurgeCandidate) {
  if (!member.workspaceUserId) {
    return { clearedToErase: true as const };
  }

  try {
    await deleteWorkspaceUser(member.orgId, member.workspaceUserId);
    return { clearedToErase: true as const };
  } catch (error) {
    // The organization has disconnected Workspace, so this account can never
    // be deleted from here however long the row is kept. Holding personal data
    // past its retention period to preserve a pointer that no longer works is
    // the worse of the two failures, so erasure proceeds and the address is
    // logged for whoever administers the directory.
    if (error instanceof WorkspaceNotConnectedError) {
      console.warn(
        "Purging a member whose Workspace account cannot be deleted: no active connection.",
        {
          memberId: member.id,
          orgId: member.orgId,
          workspaceUserEmail: member.workspaceUserEmail,
        },
      );
      return { clearedToErase: true as const };
    }

    const message = error instanceof Error ? error.message : String(error);
    const attempts = member.workspacePurgeAttempts + 1;

    await db
      .update(tenantMembers)
      .set({
        workspacePurgeAttempts: attempts,
        workspacePurgeLastError: message,
        updatedAt: new Date(),
      })
      .where(eq(tenantMembers.id, member.id));

    return {
      clearedToErase: false as const,
      stalled: attempts >= MAX_WORKSPACE_PURGE_ATTEMPTS,
      message,
    };
  }
}

/**
 * Erases every soft-deleted member whose grace period has expired.
 *
 * Due-ness comes from `purgeAfter`, the anchor stamped at delete time — not
 * from `deletedAt` plus the current constant. A row with no anchor is skipped
 * rather than erased on a guess.
 *
 * This deliberately is not one transaction any more. It makes a Google API call
 * per member with a Workspace account, and holding a transaction open across a
 * network round trip per member would keep locks on `tenant_members` for as
 * long as Google takes to answer. The database work is still transactional; the
 * disposal that precedes it is not, and is idempotent so a crashed run is
 * simply re-run.
 */
export async function purgeDeletedMembers() {
  const now = new Date();

  const due: PurgeCandidate[] = await db
    .select({
      id: tenantMembers.id,
      orgId: tenantMembers.orgId,
      userId: tenantMembers.userId,
      workspaceUserId: tenantMembers.workspaceUserId,
      workspaceUserEmail: tenantMembers.workspaceUserEmail,
      workspacePurgeAttempts: tenantMembers.workspacePurgeAttempts,
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.status, "deleted"),
        lt(tenantMembers.purgeAfter, now),
        lt(tenantMembers.workspacePurgeAttempts, MAX_WORKSPACE_PURGE_ATTEMPTS),
      ),
    );

  if (due.length === 0) {
    return {
      deletedCount: 0,
      deletedIdentityCount: 0,
      workspaceFailureCount: 0,
      stalledMemberIds: [] as string[],
      cutoffIso: now.toISOString(),
    };
  }

  const erasable: PurgeCandidate[] = [];
  const stalledMemberIds: string[] = [];
  let workspaceFailureCount = 0;

  for (const member of due) {
    const outcome = await disposeWorkspaceAccount(member);

    if (outcome.clearedToErase) {
      erasable.push(member);
      continue;
    }

    workspaceFailureCount += 1;

    if (outcome.stalled) {
      stalledMemberIds.push(member.id);
      console.error(
        "Member stuck in the purge: their Workspace account cannot be deleted.",
        {
          memberId: member.id,
          orgId: member.orgId,
          workspaceUserEmail: member.workspaceUserEmail,
          attempts: MAX_WORKSPACE_PURGE_ATTEMPTS,
          lastError: outcome.message,
        },
      );
    }
  }

  if (erasable.length === 0) {
    return {
      deletedCount: 0,
      deletedIdentityCount: 0,
      workspaceFailureCount,
      stalledMemberIds,
      cutoffIso: now.toISOString(),
    };
  }

  return db.transaction(async (tx) => {
    await tx.delete(tenantMembers).where(
      inArray(
        tenantMembers.id,
        erasable.map((member) => member.id),
      ),
    );

    // After the member rows are gone, so the "nothing references this user"
    // check sees the state the purge is leaving behind rather than the one it
    // started from.
    const deletedIdentityCount = await deleteOrphanedIdentities(
      tx,
      erasable.map((member) => member.userId),
    );

    return {
      deletedCount: erasable.length,
      deletedIdentityCount,
      workspaceFailureCount,
      stalledMemberIds,
      cutoffIso: now.toISOString(),
    };
  });
}
