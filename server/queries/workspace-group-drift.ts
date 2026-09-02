import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupMemberships,
  groupWorkspaceLinks,
  groups,
  tenantMembers,
  workspaceGroupDrift,
} from "@/server/db/schema";

export type WorkspaceDriftRow = Awaited<
  ReturnType<typeof listWorkspaceGroupDrift>
>[number];

function memberName(row: {
  firstName: string;
  lastName: string;
  email: string | null;
}) {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return name || row.email || "Unnamed member";
}

/**
 * The drift inbox. Each row is an address in a linked Google group that the
 * Spoleek roster does not account for, already matched against the member
 * directory so the admin sees "Adopt Jane Doe" rather than an address they have
 * to recognise.
 */
export async function listWorkspaceGroupDrift(
  orgId: string,
  options?: { groupId?: string; includeIgnored?: boolean },
) {
  const rows = await db
    .select({
      id: workspaceGroupDrift.id,
      linkId: workspaceGroupDrift.linkId,
      address: workspaceGroupDrift.address,
      role: workspaceGroupDrift.role,
      memberType: workspaceGroupDrift.memberType,
      workspaceUserId: workspaceGroupDrift.workspaceUserId,
      status: workspaceGroupDrift.status,
      firstSeenAt: workspaceGroupDrift.firstSeenAt,
      lastSeenAt: workspaceGroupDrift.lastSeenAt,
      groupId: groupWorkspaceLinks.groupId,
      groupName: groups.name,
      direction: groupWorkspaceLinks.direction,
      workspaceGroupEmail: groupWorkspaceLinks.workspaceGroupEmail,
    })
    .from(workspaceGroupDrift)
    .innerJoin(
      groupWorkspaceLinks,
      eq(groupWorkspaceLinks.id, workspaceGroupDrift.linkId),
    )
    .innerJoin(groups, eq(groups.id, groupWorkspaceLinks.groupId))
    .where(
      and(
        eq(workspaceGroupDrift.orgId, orgId),
        options?.groupId
          ? eq(groupWorkspaceLinks.groupId, options.groupId)
          : undefined,
        options?.includeIgnored
          ? undefined
          : eq(workspaceGroupDrift.status, "open"),
      ),
    )
    .orderBy(asc(groups.name), asc(workspaceGroupDrift.address));

  if (rows.length === 0) return [];

  const addresses = [...new Set(rows.map((row) => row.address))];

  const candidates = await db
    .select({
      id: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      status: tenantMembers.status,
      workspaceUserEmail: tenantMembers.workspaceUserEmail,
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        sql`${tenantMembers.status} <> 'deleted'`,
        or(
          inArray(sql`lower(${tenantMembers.workspaceUserEmail})`, addresses),
          inArray(sql`lower(${tenantMembers.email})`, addresses),
        ),
      ),
    );

  const byAddress = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    // A Workspace address is the stronger identity, so it wins a tie with a
    // different member who happens to use the same personal address.
    for (const [value, strong] of [
      [candidate.workspaceUserEmail, true],
      [candidate.email, false],
    ] as const) {
      if (!value) continue;
      const key = value.trim().toLowerCase();
      if (strong || !byAddress.has(key)) byAddress.set(key, candidate);
    }
  }

  // Which of those members are already in the Spoleek group — adopting them is
  // then a no-op that only needs the ledger row.
  const memberIds = [...new Set([...byAddress.values()].map((row) => row.id))];
  const existing =
    memberIds.length > 0
      ? await db
          .select({
            memberId: groupMemberships.memberId,
            groupId: groupMemberships.groupId,
          })
          .from(groupMemberships)
          .where(
            and(
              eq(groupMemberships.orgId, orgId),
              inArray(groupMemberships.memberId, memberIds),
            ),
          )
      : [];

  const inGroup = new Set(
    existing.map((row) => `${row.groupId}:${row.memberId}`),
  );

  return rows.map((row) => {
    const match = byAddress.get(row.address) ?? null;

    return {
      ...row,
      matchedMemberId: match?.id ?? null,
      matchedMemberName: match ? memberName(match) : null,
      matchedMemberStatus: match?.status ?? null,
      alreadyInGroup: match
        ? inGroup.has(`${row.groupId}:${match.id}`)
        : false,
    };
  });
}

/** Open drift per link, for the health badges. */
export async function countOpenDriftByLink(orgId: string) {
  const rows = await db
    .select({ linkId: workspaceGroupDrift.linkId, total: count() })
    .from(workspaceGroupDrift)
    .where(
      and(
        eq(workspaceGroupDrift.orgId, orgId),
        eq(workspaceGroupDrift.status, "open"),
      ),
    )
    .groupBy(workspaceGroupDrift.linkId);

  return new Map(rows.map((row) => [row.linkId, row.total]));
}
