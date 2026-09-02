import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { workspaceGroupDrift } from "@/server/db/schema";
import {
  normalizeAddress,
  type ActualMember,
} from "@/server/lib/workspace/reconcile";

export type DriftLink = {
  id: string;
  orgId: string;
  workspaceGroupId: string;
};

/**
 * Make the stored drift set for one link match what the reconciler just saw.
 *
 * Rows that are still present are touched (role and `lastSeenAt` refreshed)
 * without disturbing `status`, so an admin's "ignore" survives every reconcile.
 * Rows that are gone are deleted rather than marked resolved: the address is no
 * longer in the Google group, so there is nothing left to decide, and if it
 * ever comes back it should come back as a fresh `open` row.
 */
export async function recordLinkDrift(link: DriftLink, drift: ActualMember[]) {
  const now = new Date();
  const seen = new Map<string, ActualMember>();

  for (const entry of drift) {
    seen.set(normalizeAddress(entry.address), entry);
  }

  if (seen.size > 0) {
    await db
      .insert(workspaceGroupDrift)
      .values(
        [...seen.entries()].map(([address, entry]) => ({
          orgId: link.orgId,
          linkId: link.id,
          workspaceGroupId: link.workspaceGroupId,
          address,
          role: entry.role,
          memberType: entry.type ?? "USER",
          firstSeenAt: now,
          lastSeenAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [workspaceGroupDrift.linkId, workspaceGroupDrift.address],
        set: {
          role: sql`excluded.role`,
          memberType: sql`excluded.member_type`,
          lastSeenAt: now,
          updatedAt: now,
        },
      });
  }

  await db.delete(workspaceGroupDrift).where(
    and(
      eq(workspaceGroupDrift.linkId, link.id),
      seen.size > 0
        ? notInArray(workspaceGroupDrift.address, [...seen.keys()])
        : undefined,
    ),
  );

  return seen.size;
}

/**
 * Drop drift rows an admin has just acted on. Adopting or removing does not
 * wait for Google to confirm — if the change never lands, the next reconcile
 * puts the row back, which is the honest outcome.
 */
export async function clearLinkDrift(linkId: string, addresses: string[]) {
  if (addresses.length === 0) return;

  await db
    .delete(workspaceGroupDrift)
    .where(
      and(
        eq(workspaceGroupDrift.linkId, linkId),
        inArray(
          workspaceGroupDrift.address,
          addresses.map((address) => normalizeAddress(address)),
        ),
      ),
    );
}
