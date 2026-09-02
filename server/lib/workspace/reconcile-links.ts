import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { groupWorkspaceLinks } from "@/server/db/schema";
import { WorkspaceNotConnectedError } from "@/server/lib/workspace/client";
import { recordLinkDrift } from "@/server/lib/workspace/drift";
import { applyPlan, planLinkSync } from "@/server/lib/workspace/group-links";
import {
  drainWorkspaceSyncOperations,
  type DrainResult,
} from "@/server/lib/workspace/sync-queue";

/**
 * The Directory API is rate-limited per project and every link costs at least
 * one `groups.get` plus a paginated `members.list`, so the nightly walk paces
 * itself rather than firing every link at once.
 */
const LINK_PAUSE_MS = 250;
const DEFAULT_LINK_LIMIT = 100;

export type ReconcileResult = {
  links: number;
  /** Links whose org has no usable Workspace connection right now. */
  skipped: number;
  queued: number;
  adopted: number;
  drift: number;
  errors: number;
  drained: DrainResult;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Walks every enabled link and reconciles it against Google. This is the only
 * thing that finds drift on its own — a membership mutation deliberately never
 * calls Google, so without this pass an address added in the Admin console
 * would stay invisible until someone opened the group and pressed Sync now.
 *
 * Least-recently-synced links go first, so a limit that bites still gives every
 * link a turn rather than starving the tail of the list.
 */
export async function reconcileWorkspaceLinks({
  limit = DEFAULT_LINK_LIMIT,
  orgId,
  pauseMs = LINK_PAUSE_MS,
}: { limit?: number; orgId?: string; pauseMs?: number } = {}): Promise<ReconcileResult> {
  const links = await db
    .select()
    .from(groupWorkspaceLinks)
    .where(
      and(
        eq(groupWorkspaceLinks.isEnabled, true),
        orgId ? eq(groupWorkspaceLinks.orgId, orgId) : undefined,
      ),
    )
    .orderBy(sql`${groupWorkspaceLinks.lastSyncedAt} asc nulls first`)
    .limit(limit);

  const result: Omit<ReconcileResult, "drained"> = {
    links: 0,
    skipped: 0,
    queued: 0,
    adopted: 0,
    drift: 0,
    errors: 0,
  };

  for (const [index, link] of links.entries()) {
    if (index > 0 && pauseMs > 0) await sleep(pauseMs);

    try {
      const preview = await planLinkSync(link);

      // The Google group may have been renamed since the last pass; the link is
      // keyed on the id, so this only refreshes what we show.
      if (
        preview.workspaceGroupEmail !== link.workspaceGroupEmail ||
        preview.workspaceGroupName !== link.workspaceGroupName
      ) {
        await db
          .update(groupWorkspaceLinks)
          .set({
            workspaceGroupEmail: preview.workspaceGroupEmail,
            workspaceGroupName: preview.workspaceGroupName,
            updatedAt: new Date(),
          })
          .where(eq(groupWorkspaceLinks.id, link.id));
      }

      const applied = await applyPlan(link, preview.plan);
      const drift = await recordLinkDrift(link, preview.plan.drift);

      result.links += 1;
      result.queued += applied.queued;
      result.adopted += applied.adopted;
      result.drift += drift;

      // A link with nothing to queue is settled here and now. The drain marks
      // the others once their operations actually land, so a link never claims
      // to be in sync while work is still outstanding.
      if (applied.queued === 0) {
        await db
          .update(groupWorkspaceLinks)
          .set({
            lastSyncedAt: new Date(),
            lastSyncStatus: "ok",
            lastSyncError: null,
            updatedAt: new Date(),
          })
          .where(eq(groupWorkspaceLinks.id, link.id));
      }
    } catch (error) {
      // An org that disconnected Workspace is not a broken link — leave its
      // status alone so the UI keeps showing the last real outcome.
      if (error instanceof WorkspaceNotConnectedError) {
        result.skipped += 1;
        continue;
      }

      result.errors += 1;
      await db
        .update(groupWorkspaceLinks)
        .set({
          lastSyncStatus: "error",
          lastSyncError: errorMessage(error),
          updatedAt: new Date(),
        })
        .where(eq(groupWorkspaceLinks.id, link.id));
    }
  }

  const drained = await drainWorkspaceSyncOperations({ limit: 500, orgId });

  return { ...result, drained };
}
