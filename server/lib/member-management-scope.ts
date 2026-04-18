import { and, asc, eq, inArray } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  type TenantRole,
} from "@/server/db/schema";
import { requireAdminAccess } from "@/server/queries/access";

export type MemberManagementGroupCategory = {
  id: string;
  name: string;
  selectionMode: "single" | "multiple";
  selectionRequired: boolean;
  groups: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
};

export type MemberManagementScope = {
  accessLevel: "full" | "scoped";
  organizationId: string;
  viewerMemberId: string | null;
  managedCategoryIds: string[] | null;
  managedGroupIds: string[] | null;
  manageableGroupCategories: MemberManagementGroupCategory[];
  roleOptions: TenantRole[];
  canAssignElevatedRoles: boolean;
  description: string;
};

function buildManageableGroupCategories(
  rows: Array<{
    categoryId: string;
    categoryName: string;
    selectionMode: "single" | "multiple";
    selectionRequired: boolean;
    groupId: string;
    groupName: string;
    groupDescription: string | null;
  }>,
) {
  const categories = new Map<string, MemberManagementGroupCategory>();

  for (const row of rows) {
    const category =
      categories.get(row.categoryId) ??
      {
        id: row.categoryId,
        name: row.categoryName,
        selectionMode: row.selectionMode,
        selectionRequired: row.selectionRequired,
        groups: [],
      };

    category.groups.push({
      id: row.groupId,
      name: row.groupName,
      description: row.groupDescription,
    });

    categories.set(row.categoryId, category);
  }

  return Array.from(categories.values());
}

async function listAllManageableGroups(orgId: string) {
  return db
    .select({
      categoryId: groupCategories.id,
      categoryName: groupCategories.name,
      selectionMode: groupCategories.selectionMode,
      selectionRequired: groupCategories.selectionRequired,
      groupId: groups.id,
      groupName: groups.name,
      groupDescription: groups.description,
    })
    .from(groups)
    .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
    .where(
      and(
        eq(groups.orgId, orgId),
        eq(groups.isActive, true),
        eq(groupCategories.isActive, true),
      ),
    )
    .orderBy(
      asc(groupCategories.sortOrder),
      asc(groupCategories.name),
      asc(groups.sortOrder),
      asc(groups.name),
    );
}

async function listScopedManageableGroups(orgId: string, memberId: string) {
  return db
    .select({
      categoryId: groupCategories.id,
      categoryName: groupCategories.name,
      selectionMode: groupCategories.selectionMode,
      selectionRequired: groupCategories.selectionRequired,
      groupId: groups.id,
      groupName: groups.name,
      groupDescription: groups.description,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.memberId, memberId),
        eq(groupMemberships.role, "group_admin"),
        eq(groups.isActive, true),
        eq(groupCategories.isActive, true),
        eq(groupCategories.groupAdminsManageMembers, true),
      ),
    )
    .orderBy(
      asc(groupCategories.sortOrder),
      asc(groupCategories.name),
      asc(groups.sortOrder),
      asc(groups.name),
    );
}

export async function resolveMemberManagementScope(): Promise<MemberManagementScope> {
  const access = await requireAdminAccess();

  if (access.adminAccessLevel === "full") {
    const manageableGroupRows = await listAllManageableGroups(access.organization.id);

    return {
      accessLevel: "full",
      organizationId: access.organization.id,
      viewerMemberId: access.member?.id ?? null,
      managedCategoryIds: null,
      managedGroupIds: null,
      manageableGroupCategories: buildManageableGroupCategories(manageableGroupRows),
      roleOptions: ["member", "leader", "org_admin"],
      canAssignElevatedRoles: true,
      description:
        "Manage memberships, approvals, shadow profiles, and group assignments across the organization.",
    };
  }

  if (!access.member) {
    forbidden();
  }

  const manageableGroupRows = await listScopedManageableGroups(
    access.organization.id,
    access.member.id,
  );

  if (manageableGroupRows.length === 0) {
    forbidden();
  }

  return {
    accessLevel: "scoped",
    organizationId: access.organization.id,
    viewerMemberId: access.member.id,
    managedCategoryIds: [...new Set(manageableGroupRows.map((row) => row.categoryId))],
    managedGroupIds: [...new Set(manageableGroupRows.map((row) => row.groupId))],
    manageableGroupCategories: buildManageableGroupCategories(manageableGroupRows),
    roleOptions: ["member"],
    canAssignElevatedRoles: false,
    description:
      "Manage members assigned to the groups you administer in delegated categories.",
  };
}

export async function canAccessMemberInScope(
  orgId: string,
  memberId: string,
  scope: Pick<MemberManagementScope, "accessLevel" | "managedGroupIds">,
) {
  if (scope.accessLevel === "full") {
    return true;
  }

  const managedGroupIds = scope.managedGroupIds ?? [];

  if (managedGroupIds.length === 0) {
    return false;
  }

  const [membership] = await db
    .select({ memberId: groupMemberships.memberId })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.memberId, memberId),
        inArray(groupMemberships.groupId, managedGroupIds),
      ),
    )
    .limit(1);

  return membership != null;
}

export function validateManagedGroupSelection(
  categories: MemberManagementGroupCategory[],
  selectedGroupIds: string[],
) {
  const allowedGroupIds = new Set(
    categories.flatMap((category) => category.groups.map((group) => group.id)),
  );

  for (const groupId of selectedGroupIds) {
    if (!allowedGroupIds.has(groupId)) {
      return "One or more selected groups are outside your management scope.";
    }
  }

  for (const category of categories) {
    if (category.selectionMode !== "single") {
      continue;
    }

    const selectedCount = category.groups.filter((group) =>
      selectedGroupIds.includes(group.id),
    ).length;

    if (selectedCount > 1) {
      return `${category.name} only allows one group assignment.`;
    }
  }

  return null;
}
