import { and, asc, count, eq, lte, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupWorkspaceLinks,
  workspaceGroupMemberLinks,
  workspaceSyncOperations,
} from "@/server/db/schema";
import {
  WorkspaceApiError,
  WorkspaceNotConnectedError,
  addWorkspaceGroupMember,
  removeWorkspaceGroupMember,
  updateWorkspaceGroupMemberRole,
} from "@/server/lib/workspace/client";

const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;

/**
 * A 4xx that will fail identically forever (a malformed address, a group we are
 * not allowed to touch) should not burn six retries; anything else — throttling,
 * a 5xx, a dropped connection — is worth backing off and trying again.
 */
function isRetryable(error: unknown) {
  if (error instanceof WorkspaceNotConnectedError) return true;
  if (error instanceof WorkspaceApiError) {
    if (error.status === 429) return true;
    if (error.status === 401) return true; // token refresh may fix it
    return error.status >= 500;
  }
  return true;
}

function backoffFor(attempts: number) {
  return new Date(
    Date.now() + Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS),
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type DrainResult = {
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
};

/**
 * Drains queued Workspace writes. Safe to call from anywhere — the request path
 * via `after()`, the cron, or a "Sync now" click — because every operation is
 * idempotent and failures are simply left in the queue with a later
 * `nextAttemptAt`.
 */
export async function drainWorkspaceSyncOperations({
  limit = 200,
  orgId,
  linkId,
}: {
  limit?: number;
  orgId?: string;
  linkId?: string;
} = {}): Promise<DrainResult> {
  const due = await db
    .select({
      operation: workspaceSyncOperations,
      workspaceGroupId: groupWorkspaceLinks.workspaceGroupId,
      isEnabled: groupWorkspaceLinks.isEnabled,
      direction: groupWorkspaceLinks.direction,
    })
    .from(workspaceSyncOperations)
    .innerJoin(
      groupWorkspaceLinks,
      eq(groupWorkspaceLinks.id, workspaceSyncOperations.linkId),
    )
    .where(
      and(
        eq(workspaceSyncOperations.status, "pending"),
        lte(workspaceSyncOperations.nextAttemptAt, new Date()),
        orgId ? eq(workspaceSyncOperations.orgId, orgId) : undefined,
        linkId ? eq(workspaceSyncOperations.linkId, linkId) : undefined,
      ),
    )
    .orderBy(asc(workspaceSyncOperations.nextAttemptAt))
    .limit(limit);

  const result: DrainResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
  };
  const touchedLinkIds = new Set<string>();

  for (const row of due) {
    const { operation } = row;
    result.processed += 1;
    touchedLinkIds.add(operation.linkId);

    // A link disabled or switched to observe after the work was queued should
    // not still write to Google.
    if (!row.isEnabled || row.direction !== "push") {
      await db
        .update(workspaceSyncOperations)
        .set({ status: "succeeded", lastError: null, updatedAt: new Date() })
        .where(eq(workspaceSyncOperations.id, operation.id));
      result.succeeded += 1;
      continue;
    }

    try {
      if (operation.kind === "add_member") {
        await addWorkspaceGroupMember(
          operation.orgId,
          row.workspaceGroupId,
          operation.address,
          operation.role ?? "member",
        );
        await db
          .insert(workspaceGroupMemberLinks)
          .values({
            orgId: operation.orgId,
            linkId: operation.linkId,
            workspaceGroupId: row.workspaceGroupId,
            address: operation.address,
            memberId: operation.memberId,
          })
          .onConflictDoNothing();
      } else if (operation.kind === "update_role") {
        await updateWorkspaceGroupMemberRole(
          operation.orgId,
          row.workspaceGroupId,
          operation.address,
          operation.role ?? "member",
        );
      } else {
        await removeWorkspaceGroupMember(
          operation.orgId,
          row.workspaceGroupId,
          operation.address,
        );
        await db
          .delete(workspaceGroupMemberLinks)
          .where(
            and(
              eq(workspaceGroupMemberLinks.linkId, operation.linkId),
              eq(workspaceGroupMemberLinks.address, operation.address),
            ),
          );
      }

      await db
        .update(workspaceSyncOperations)
        .set({ status: "succeeded", lastError: null, updatedAt: new Date() })
        .where(eq(workspaceSyncOperations.id, operation.id));
      result.succeeded += 1;
    } catch (error) {
      const attempts = operation.attempts + 1;
      const giveUp = !isRetryable(error) || attempts >= MAX_ATTEMPTS;

      await db
        .update(workspaceSyncOperations)
        .set({
          attempts,
          status: giveUp ? "failed" : "pending",
          nextAttemptAt: backoffFor(attempts),
          lastError: errorMessage(error),
          updatedAt: new Date(),
        })
        .where(eq(workspaceSyncOperations.id, operation.id));

      if (giveUp) {
        result.failed += 1;
        await db
          .update(groupWorkspaceLinks)
          .set({
            lastSyncStatus: "error",
            lastSyncError: errorMessage(error),
            updatedAt: new Date(),
          })
          .where(eq(groupWorkspaceLinks.id, operation.linkId));
      } else {
        result.retrying += 1;
      }
    }
  }

  await markSettledLinks([...touchedLinkIds]);

  return result;
}

/**
 * A link is healthy once nothing is left queued or failed for it. Checked after
 * a drain rather than per operation so a link is not flipped to "ok" while
 * later operations from the same batch are still pending.
 */
async function markSettledLinks(linkIds: string[]) {
  for (const linkId of linkIds) {
    const [{ outstanding }] = await db
      .select({
        outstanding: sql<number>`count(*) filter (where ${workspaceSyncOperations.status} <> 'succeeded')::int`,
      })
      .from(workspaceSyncOperations)
      .where(eq(workspaceSyncOperations.linkId, linkId));

    if (outstanding > 0) continue;

    await db
      .update(groupWorkspaceLinks)
      .set({
        lastSyncStatus: "ok",
        lastSyncError: null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(groupWorkspaceLinks.id, linkId));
  }
}

export async function countPendingOperations(orgId: string) {
  const rows = await db
    .select({
      linkId: workspaceSyncOperations.linkId,
      status: workspaceSyncOperations.status,
      total: count(),
    })
    .from(workspaceSyncOperations)
    .where(
      and(
        eq(workspaceSyncOperations.orgId, orgId),
        sql`${workspaceSyncOperations.status} <> 'succeeded'`,
      ),
    )
    .groupBy(workspaceSyncOperations.linkId, workspaceSyncOperations.status);

  const byLink = new Map<string, { pending: number; failed: number }>();
  for (const row of rows) {
    const entry = byLink.get(row.linkId) ?? { pending: 0, failed: 0 };
    if (row.status === "failed") entry.failed += row.total;
    else entry.pending += row.total;
    byLink.set(row.linkId, entry);
  }

  return byLink;
}
