import { and, asc, eq, inArray, ne } from "drizzle-orm";

import type { MailingListScope } from "@/lib/mailing-list";
import { db } from "@/server/db";
import { resolveMemberManagementScope } from "@/server/lib/member-management-scope";
import { groupMemberships, groups, tenantMembers } from "@/server/db/schema";
import {
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
  workspaceEmail: string | null;
  preferredEmailSetting: "personal" | "workspace" | null;
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
  workspaceUserEmail?: string | null;
  preferredEmail?: "personal" | "workspace" | null;
  userId: string | null;
}): ResolvedMemberDatasetRow {
  return {
    memberId: row.memberId ?? row.id ?? "",
    firstName: row.firstName,
    lastName: row.lastName,
    personalEmail: normalizeEmail(row.email),
    workspaceEmail: normalizeEmail(row.workspaceUserEmail ?? null),
    preferredEmailSetting: row.preferredEmail ?? null,
    userId: row.userId,
  };
}

async function listScopedMembersAdminDataset(orgId: string, scopedGroupIds: string[]) {
  if (scopedGroupIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      workspaceUserEmail: tenantMembers.workspaceUserEmail,
      preferredEmail: tenantMembers.preferredEmail,
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
        inArray(groupMemberships.groupId, scopedGroupIds),
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
  await requireAdminAccess({
    capability: "canManageScopedMembers",
  });
  const scope = await resolveMemberManagementScope();

  if (scope.accessLevel === "full") {
    const members = await listTenantMembers(scope.organizationId);
    return members.map((member) => toResolvedDatasetRow(member));
  }

  return listScopedMembersAdminDataset(scope.organizationId, scope.managedGroupIds ?? []);
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
