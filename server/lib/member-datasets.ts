import { and, asc, eq, inArray, ne, or } from "drizzle-orm";

import type { MailingListScope } from "@/lib/mailing-list";
import { db } from "@/server/db";
import { groupMemberships, groups, tenantMembers } from "@/server/db/schema";
import {
  listAccessibleCategoryIds,
  listScopedGroupIds,
  requireAdminAccess,
  requireGroupManagementAccess,
} from "@/server/queries/access";
import { listGroupAdmins, listGroupMembers } from "@/server/queries/groups";
import { listTenantMembers } from "@/server/queries/members";

export type ResolvedMemberDatasetRow = {
  memberId: string;
  firstName: string;
  lastName: string;
  personalEmail: string | null;
  userId: string | null;
};

function normalizeEmail(email: string | null) {
  const normalized = email?.trim().toLowerCase() ?? null;
  return normalized && normalized.length > 0 ? normalized : null;
}

function toResolvedDatasetRow(row: {
  id?: string;
  memberId?: string;
  firstName: string;
  lastName: string;
  email: string | null;
  userId: string | null;
}): ResolvedMemberDatasetRow {
  return {
    memberId: row.memberId ?? row.id ?? "",
    firstName: row.firstName,
    lastName: row.lastName,
    personalEmail: normalizeEmail(row.email),
    userId: row.userId,
  };
}

async function listScopedMembersAdminDataset(orgId: string, memberId: string) {
  const [accessibleCategoryIds, scopedGroupIds] = await Promise.all([
    listAccessibleCategoryIds(orgId, memberId),
    listScopedGroupIds(orgId, memberId),
  ]);

  if (accessibleCategoryIds.length === 0 && scopedGroupIds.length === 0) {
    return [];
  }

  const membershipScopeFilters = [];

  if (accessibleCategoryIds.length > 0) {
    membershipScopeFilters.push(inArray(groups.categoryId, accessibleCategoryIds));
  }

  if (scopedGroupIds.length > 0) {
    membershipScopeFilters.push(inArray(groupMemberships.groupId, scopedGroupIds));
  }

  const rows = await db
    .select({
      id: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      userId: tenantMembers.userId,
    })
    .from(groupMemberships)
    .innerJoin(tenantMembers, eq(tenantMembers.id, groupMemberships.memberId))
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(tenantMembers.orgId, orgId),
        ne(tenantMembers.status, "deleted"),
        or(...membershipScopeFilters),
      ),
    )
    .orderBy(asc(tenantMembers.createdAt), asc(groupMemberships.createdAt));

  const dedupedRows = new Map<string, ResolvedMemberDatasetRow>();

  for (const row of rows) {
    if (!dedupedRows.has(row.id)) {
      dedupedRows.set(row.id, toResolvedDatasetRow(row));
    }
  }

  return Array.from(dedupedRows.values());
}

async function resolveMembersAdminDataset() {
  const access = await requireAdminAccess({
    capability: "canManageScopedMembers",
  });

  if (access.adminAccessLevel === "full") {
    const members = await listTenantMembers(access.organization.id);
    return members.map((member) => toResolvedDatasetRow(member));
  }

  if (!access.member) {
    return [];
  }

  return listScopedMembersAdminDataset(access.organization.id, access.member.id);
}

async function resolveGroupMembersDataset(groupId: string) {
  const access = await requireGroupManagementAccess(groupId);
  const members = await listGroupMembers(access.organization.id, groupId);

  return members.map((member) => toResolvedDatasetRow(member));
}

async function resolveGroupAdminsDataset(groupId: string) {
  const access = await requireGroupManagementAccess(groupId);
  const members = await listGroupAdmins(access.organization.id, groupId);

  return members.map((member) => toResolvedDatasetRow(member));
}

export async function resolveMemberDataset(scope: MailingListScope) {
  switch (scope.kind) {
    case "members-admin":
      return resolveMembersAdminDataset();
    case "group-members":
      return resolveGroupMembersDataset(scope.contextId);
    case "group-admins":
      return resolveGroupAdminsDataset(scope.contextId);
  }
}
