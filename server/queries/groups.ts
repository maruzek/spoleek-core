import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { db } from "@/server/db";
import {
  categoryAdminAssignments,
  groupCategories,
  groupMemberships,
  groups,
  tenantMembers,
  users,
} from "@/server/db/schema";
import { hasGroupCategoryMembersTableColumn } from "@/server/lib/group-category-members-table-column";

export async function listGroupCategories(orgId: string) {
  const hasMembersTableColumn = await hasGroupCategoryMembersTableColumn();

  if (!hasMembersTableColumn) {
    return db
      .select({
        id: groupCategories.id,
        name: groupCategories.name,
        slug: groupCategories.slug,
        description: groupCategories.description,
        registrationFieldLabel: groupCategories.registrationFieldLabel,
        isActive: groupCategories.isActive,
        isPinnedToNavigation: groupCategories.isPinnedToNavigation,
        showInRegistration: groupCategories.showInRegistration,
        showInMembersTable: sql<boolean>`false`,
        groupAdminsManageMembers: groupCategories.groupAdminsManageMembers,
        selectionMode: groupCategories.selectionMode,
        selectionRequired: groupCategories.selectionRequired,
        maxSelections: groupCategories.maxSelections,
        defaultJoinPolicy: groupCategories.defaultJoinPolicy,
        sortOrder: groupCategories.sortOrder,
        createdAt: groupCategories.createdAt,
        updatedAt: groupCategories.updatedAt,
        groupCount: sql<number>`count(distinct ${groups.id})::int`,
        adminCount: sql<number>`count(distinct ${categoryAdminAssignments.id})::int`,
      })
      .from(groupCategories)
      .leftJoin(
        groups,
        and(eq(groups.categoryId, groupCategories.id), eq(groups.orgId, groupCategories.orgId)),
      )
      .leftJoin(
        categoryAdminAssignments,
        and(
          eq(categoryAdminAssignments.categoryId, groupCategories.id),
          eq(categoryAdminAssignments.orgId, groupCategories.orgId),
        ),
      )
      .where(eq(groupCategories.orgId, orgId))
      .groupBy(groupCategories.id)
      .orderBy(asc(groupCategories.sortOrder), asc(groupCategories.name));
  }

  return db
    .select({
      id: groupCategories.id,
      name: groupCategories.name,
      slug: groupCategories.slug,
      description: groupCategories.description,
      registrationFieldLabel: groupCategories.registrationFieldLabel,
      isActive: groupCategories.isActive,
      isPinnedToNavigation: groupCategories.isPinnedToNavigation,
      showInRegistration: groupCategories.showInRegistration,
      showInMembersTable: groupCategories.showInMembersTable,
      groupAdminsManageMembers: groupCategories.groupAdminsManageMembers,
      selectionMode: groupCategories.selectionMode,
      selectionRequired: groupCategories.selectionRequired,
      maxSelections: groupCategories.maxSelections,
      defaultJoinPolicy: groupCategories.defaultJoinPolicy,
      sortOrder: groupCategories.sortOrder,
      createdAt: groupCategories.createdAt,
      updatedAt: groupCategories.updatedAt,
      groupCount: sql<number>`count(distinct ${groups.id})::int`,
      adminCount: sql<number>`count(distinct ${categoryAdminAssignments.id})::int`,
    })
    .from(groupCategories)
    .leftJoin(
      groups,
      and(eq(groups.categoryId, groupCategories.id), eq(groups.orgId, groupCategories.orgId)),
    )
    .leftJoin(
      categoryAdminAssignments,
      and(
        eq(categoryAdminAssignments.categoryId, groupCategories.id),
        eq(categoryAdminAssignments.orgId, groupCategories.orgId),
      ),
    )
    .where(eq(groupCategories.orgId, orgId))
    .groupBy(groupCategories.id)
    .orderBy(
      asc(groupCategories.sortOrder),
      asc(groupCategories.name),
    );
}

export async function getGroupCategoryById(orgId: string, categoryId: string) {
  const hasMembersTableColumn = await hasGroupCategoryMembersTableColumn();

  const [category] = hasMembersTableColumn
    ? await db
        .select({
          id: groupCategories.id,
          orgId: groupCategories.orgId,
          name: groupCategories.name,
          slug: groupCategories.slug,
          description: groupCategories.description,
          registrationFieldLabel: groupCategories.registrationFieldLabel,
          isActive: groupCategories.isActive,
          isPinnedToNavigation: groupCategories.isPinnedToNavigation,
          showInRegistration: groupCategories.showInRegistration,
          showInMembersTable: groupCategories.showInMembersTable,
          groupAdminsManageMembers: groupCategories.groupAdminsManageMembers,
          selectionMode: groupCategories.selectionMode,
          selectionRequired: groupCategories.selectionRequired,
          maxSelections: groupCategories.maxSelections,
          defaultJoinPolicy: groupCategories.defaultJoinPolicy,
          sortOrder: groupCategories.sortOrder,
          specialCapability: groupCategories.specialCapability,
          createdAt: groupCategories.createdAt,
          updatedAt: groupCategories.updatedAt,
        })
        .from(groupCategories)
        .where(and(eq(groupCategories.orgId, orgId), eq(groupCategories.id, categoryId)))
        .limit(1)
    : await db
        .select({
          id: groupCategories.id,
          orgId: groupCategories.orgId,
          name: groupCategories.name,
          slug: groupCategories.slug,
          description: groupCategories.description,
          registrationFieldLabel: groupCategories.registrationFieldLabel,
          isActive: groupCategories.isActive,
          isPinnedToNavigation: groupCategories.isPinnedToNavigation,
          showInRegistration: groupCategories.showInRegistration,
          showInMembersTable: sql<boolean>`false`,
          groupAdminsManageMembers: groupCategories.groupAdminsManageMembers,
          selectionMode: groupCategories.selectionMode,
          selectionRequired: groupCategories.selectionRequired,
          maxSelections: groupCategories.maxSelections,
          defaultJoinPolicy: groupCategories.defaultJoinPolicy,
          sortOrder: groupCategories.sortOrder,
          specialCapability: groupCategories.specialCapability,
          createdAt: groupCategories.createdAt,
          updatedAt: groupCategories.updatedAt,
        })
        .from(groupCategories)
        .where(and(eq(groupCategories.orgId, orgId), eq(groupCategories.id, categoryId)))
        .limit(1);

  return category ?? null;
}

export async function listGroupsByCategory(
  orgId: string,
  categoryId: string,
  options?: { visibleGroupIds?: string[] | null },
) {
  const visibleGroupIds = options?.visibleGroupIds;

  if (visibleGroupIds?.length === 0) {
    return [];
  }

  return db
    .select({
      id: groups.id,
      categoryId: groups.categoryId,
      name: groups.name,
      slug: groups.slug,
      description: groups.description,
      joinPolicy: groups.joinPolicy,
      isActive: groups.isActive,
      sortOrder: groups.sortOrder,
      createdAt: groups.createdAt,
      updatedAt: groups.updatedAt,
      memberCount: sql<number>`count(distinct ${groupMemberships.id})::int`,
      adminCount: sql<number>`count(distinct case when ${groupMemberships.role} = 'group_admin' then ${groupMemberships.id} end)::int`,
    })
    .from(groups)
    .leftJoin(
      groupMemberships,
      and(eq(groupMemberships.groupId, groups.id), eq(groupMemberships.orgId, groups.orgId)),
    )
    .where(
      and(
        eq(groups.orgId, orgId),
        eq(groups.categoryId, categoryId),
        visibleGroupIds ? inArray(groups.id, visibleGroupIds) : undefined,
      ),
    )
    .groupBy(groups.id)
    .orderBy(asc(groups.sortOrder), asc(groups.name));
}

export async function getGroupById(orgId: string, groupId: string) {
  const [group] = await db
    .select({
      id: groups.id,
      orgId: groups.orgId,
      categoryId: groups.categoryId,
      name: groups.name,
      slug: groups.slug,
      description: groups.description,
      joinPolicy: groups.joinPolicy,
      isActive: groups.isActive,
      sortOrder: groups.sortOrder,
      createdAt: groups.createdAt,
      updatedAt: groups.updatedAt,
      categoryName: groupCategories.name,
      categorySlug: groupCategories.slug,
    })
    .from(groups)
    .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
    .where(and(eq(groups.orgId, orgId), eq(groups.id, groupId)))
    .limit(1);

  return group ?? null;
}

export async function listCategoryAdmins(orgId: string, categoryId: string) {
  return db
    .select({
      assignmentId: categoryAdminAssignments.id,
      memberId: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      status: tenantMembers.status,
      role: tenantMembers.role,
      userId: tenantMembers.userId,
      linkedUserName: users.name,
      assignedAt: categoryAdminAssignments.createdAt,
    })
    .from(categoryAdminAssignments)
    .innerJoin(tenantMembers, eq(tenantMembers.id, categoryAdminAssignments.memberId))
    .leftJoin(users, eq(users.id, tenantMembers.userId))
    .where(
      and(
        eq(categoryAdminAssignments.orgId, orgId),
        eq(categoryAdminAssignments.categoryId, categoryId),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .orderBy(asc(tenantMembers.firstName), asc(tenantMembers.lastName));
}

export async function listGroupMembershipRows(orgId: string, groupId: string) {
  return db
    .select({
      membershipId: groupMemberships.id,
      memberId: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      status: tenantMembers.status,
      tenantRole: tenantMembers.role,
      groupRole: groupMemberships.role,
      userId: tenantMembers.userId,
      linkedUserName: users.name,
      assignedAt: groupMemberships.createdAt,
    })
    .from(groupMemberships)
    .innerJoin(tenantMembers, eq(tenantMembers.id, groupMemberships.memberId))
    .leftJoin(users, eq(users.id, tenantMembers.userId))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.groupId, groupId),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .orderBy(asc(tenantMembers.firstName), asc(tenantMembers.lastName));
}

export async function listGroupMembers(orgId: string, groupId: string) {
  const rows = await listGroupMembershipRows(orgId, groupId);
  return rows;
}

export async function listGroupAdmins(orgId: string, groupId: string) {
  return (await listGroupMembershipRows(orgId, groupId)).filter(
    (row) => row.groupRole === "group_admin",
  );
}

export async function listAssignableTenantMembers(orgId: string) {
  return db
    .select({
      id: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      role: tenantMembers.role,
      status: tenantMembers.status,
      userId: tenantMembers.userId,
      linkedUserName: users.name,
      createdAt: tenantMembers.createdAt,
    })
    .from(tenantMembers)
    .leftJoin(users, eq(users.id, tenantMembers.userId))
    .where(and(eq(tenantMembers.orgId, orgId), ne(tenantMembers.status, "deleted")))
    .orderBy(
      asc(tenantMembers.firstName),
      asc(tenantMembers.lastName),
      desc(tenantMembers.createdAt),
    );
}

export async function getCategoryDetailData(
  orgId: string,
  categoryId: string,
  options?: { visibleGroupIds?: string[] | null },
) {
  const [category, categoryAdmins, groupsInCategory, assignableMembers] = await Promise.all([
    getGroupCategoryById(orgId, categoryId),
    listCategoryAdmins(orgId, categoryId),
    listGroupsByCategory(orgId, categoryId, options),
    listAssignableTenantMembers(orgId),
  ]);

  if (!category) {
    return null;
  }

  return {
    category,
    categoryAdmins,
    groups: groupsInCategory,
    assignableMembers,
  };
}

export async function getGroupDetailData(orgId: string, groupId: string) {
  const [group, members, admins, assignableMembers] = await Promise.all([
    getGroupById(orgId, groupId),
    listGroupMembers(orgId, groupId),
    listGroupAdmins(orgId, groupId),
    listAssignableTenantMembers(orgId),
  ]);

  if (!group) {
    return null;
  }

  return {
    group,
    members,
    admins,
    assignableMembers,
    groupLabel: getMemberDisplayName({
      firstName: group.name,
      lastName: "",
    }),
  };
}
