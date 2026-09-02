import { and, asc, count, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupCategories,
  groupWorkspaceLinks,
  groups,
  workspaceGroupMemberLinks,
} from "@/server/db/schema";
import { countPendingOperations } from "@/server/lib/workspace/sync-queue";
import { countOpenDriftByLink } from "@/server/queries/workspace-group-drift";

export type GroupWorkspaceLinkRow = Awaited<
  ReturnType<typeof listGroupWorkspaceLinks>
>[number];

export async function listGroupWorkspaceLinks(
  orgId: string,
  options?: { groupId?: string },
) {
  const [rows, pendingByLink, driftByLink] = await Promise.all([
    db
      .select({
        id: groupWorkspaceLinks.id,
        groupId: groupWorkspaceLinks.groupId,
        groupName: groups.name,
        categoryId: groups.categoryId,
        categoryName: groupCategories.name,
        workspaceGroupId: groupWorkspaceLinks.workspaceGroupId,
        workspaceGroupEmail: groupWorkspaceLinks.workspaceGroupEmail,
        workspaceGroupName: groupWorkspaceLinks.workspaceGroupName,
        direction: groupWorkspaceLinks.direction,
        memberRole: groupWorkspaceLinks.memberRole,
        adminRole: groupWorkspaceLinks.adminRole,
        removalPolicy: groupWorkspaceLinks.removalPolicy,
        includeExternal: groupWorkspaceLinks.includeExternal,
        isEnabled: groupWorkspaceLinks.isEnabled,
        lastSyncedAt: groupWorkspaceLinks.lastSyncedAt,
        lastSyncStatus: groupWorkspaceLinks.lastSyncStatus,
        lastSyncError: groupWorkspaceLinks.lastSyncError,
      })
      .from(groupWorkspaceLinks)
      .innerJoin(groups, eq(groups.id, groupWorkspaceLinks.groupId))
      .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
      .where(
        and(
          eq(groupWorkspaceLinks.orgId, orgId),
          options?.groupId
            ? eq(groupWorkspaceLinks.groupId, options.groupId)
            : undefined,
        ),
      )
      .orderBy(asc(groupCategories.name), asc(groups.name)),
    countPendingOperations(orgId),
    countOpenDriftByLink(orgId),
  ]);

  // How many Google memberships this link is responsible for — the number the
  // unlink dialog has to be able to state exactly.
  const ownedRows = await db
    .select({
      linkId: workspaceGroupMemberLinks.linkId,
      total: count(),
    })
    .from(workspaceGroupMemberLinks)
    .where(eq(workspaceGroupMemberLinks.orgId, orgId))
    .groupBy(workspaceGroupMemberLinks.linkId);

  const ownedByLink = new Map(ownedRows.map((row) => [row.linkId, row.total]));

  return rows.map((row) => {
    const counts = pendingByLink.get(row.id) ?? { pending: 0, failed: 0 };
    return {
      ...row,
      pendingCount: counts.pending,
      failedCount: counts.failed,
      ownedCount: ownedByLink.get(row.id) ?? 0,
      driftCount: driftByLink.get(row.id) ?? 0,
    };
  });
}

export async function getGroupWorkspaceLink(orgId: string, linkId: string) {
  const [link] = await db
    .select()
    .from(groupWorkspaceLinks)
    .where(
      and(
        eq(groupWorkspaceLinks.orgId, orgId),
        eq(groupWorkspaceLinks.id, linkId),
      ),
    )
    .limit(1);

  return link ?? null;
}
