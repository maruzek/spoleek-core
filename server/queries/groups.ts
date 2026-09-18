import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

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
import { activeMembership } from "@/server/lib/group-membership";
import { hasGroupCategoryMembersTableColumn } from "@/server/lib/group-category-members-table-column";

export { activeMembership };

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
        showGroupsToNonMembers: groupCategories.showGroupsToNonMembers,
        showInRegistration: groupCategories.showInRegistration,
        showInMembersTable: sql<boolean>`false`,
        groupAdminsManageMembers: groupCategories.groupAdminsManageMembers,
      managesMembershipFees: groupCategories.managesMembershipFees,
      notifyOnRegistration: groupCategories.notifyOnRegistration,
      notificationEmail: groupCategories.notificationEmail,
        selectionMode: groupCategories.selectionMode,
        selectionRequired: groupCategories.selectionRequired,
        maxSelections: groupCategories.maxSelections,
        defaultJoinPolicy: groupCategories.defaultJoinPolicy,
        sortOrder: groupCategories.sortOrder,
        specialCapability: groupCategories.specialCapability,
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
      showGroupsToNonMembers: groupCategories.showGroupsToNonMembers,
      showInRegistration: groupCategories.showInRegistration,
      showInMembersTable: groupCategories.showInMembersTable,
      groupAdminsManageMembers: groupCategories.groupAdminsManageMembers,
      managesMembershipFees: groupCategories.managesMembershipFees,
      notifyOnRegistration: groupCategories.notifyOnRegistration,
      notificationEmail: groupCategories.notificationEmail,
      selectionMode: groupCategories.selectionMode,
      selectionRequired: groupCategories.selectionRequired,
      maxSelections: groupCategories.maxSelections,
      defaultJoinPolicy: groupCategories.defaultJoinPolicy,
      sortOrder: groupCategories.sortOrder,
      specialCapability: groupCategories.specialCapability,
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
          showGroupsToNonMembers: groupCategories.showGroupsToNonMembers,
          showInRegistration: groupCategories.showInRegistration,
          showInMembersTable: groupCategories.showInMembersTable,
          groupAdminsManageMembers: groupCategories.groupAdminsManageMembers,
          managesMembershipFees: groupCategories.managesMembershipFees,
          notifyOnRegistration: groupCategories.notifyOnRegistration,
          notificationEmail: groupCategories.notificationEmail,
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
          showGroupsToNonMembers: groupCategories.showGroupsToNonMembers,
          showInRegistration: groupCategories.showInRegistration,
          showInMembersTable: sql<boolean>`false`,
          groupAdminsManageMembers: groupCategories.groupAdminsManageMembers,
          managesMembershipFees: groupCategories.managesMembershipFees,
          notifyOnRegistration: groupCategories.notifyOnRegistration,
          notificationEmail: groupCategories.notificationEmail,
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
      feeRenewalMonth: groups.feeRenewalMonth,
      feeRenewalDay: groups.feeRenewalDay,
      feeAmount: groups.feeAmount,
      feeBankAccount: groups.feeBankAccount,
      feePaymentWindowDays: groups.feePaymentWindowDays,
      createdAt: groups.createdAt,
      updatedAt: groups.updatedAt,
      memberCount: sql<number>`count(distinct case when ${groupMemberships.status} = 'active' then ${groupMemberships.id} end)::int`,
      adminCount: sql<number>`count(distinct case when ${groupMemberships.status} = 'active' and ${groupMemberships.role} = 'group_admin' then ${groupMemberships.id} end)::int`,
      pendingRequestCount: sql<number>`count(distinct case when ${groupMemberships.status} = 'pending' then ${groupMemberships.id} end)::int`,
    })
    .from(groups)
    // Joined without activeMembership() on purpose: the member/admin counts
    // filter `active` inside their aggregates so the pending badge can share
    // the scan.
    .leftJoin(
      groupMemberships,
      and(
        eq(groupMemberships.groupId, groups.id),
        eq(groupMemberships.orgId, groups.orgId),
      ),
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

export async function listPinnedGroupCategoriesForSidebar(orgId: string) {
  return db
    .select({
      categoryId: groupCategories.id,
      categoryName: groupCategories.name,
      categorySortOrder: groupCategories.sortOrder,
      groupId: groups.id,
      groupName: groups.name,
      groupSortOrder: groups.sortOrder,
    })
    .from(groupCategories)
    .leftJoin(
      groups,
      and(
        eq(groups.orgId, orgId),
        eq(groups.categoryId, groupCategories.id),
        eq(groups.isActive, true),
      ),
    )
    .where(
      and(
        eq(groupCategories.orgId, orgId),
        eq(groupCategories.isActive, true),
        eq(groupCategories.isPinnedToNavigation, true),
      ),
    )
    .orderBy(
      asc(groupCategories.sortOrder),
      asc(groupCategories.name),
      asc(groups.sortOrder),
      asc(groups.name),
    );
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
      feeRenewalMonth: groups.feeRenewalMonth,
      feeRenewalDay: groups.feeRenewalDay,
      feeAmount: groups.feeAmount,
      feeBankAccount: groups.feeBankAccount,
      feePaymentWindowDays: groups.feePaymentWindowDays,
      workspaceOrgUnitPath: groups.workspaceOrgUnitPath,
      notifyViaWorkspaceGroup: groups.notifyViaWorkspaceGroup,
      notificationEmail: groups.notificationEmail,
      createdAt: groups.createdAt,
      updatedAt: groups.updatedAt,
      categoryName: groupCategories.name,
      categorySlug: groupCategories.slug,
      categoryManagesFees: groupCategories.managesMembershipFees,
      categoryNotifiesOnRegistration: groupCategories.notifyOnRegistration,
      categorySpecialCapability: groupCategories.specialCapability,
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
        activeMembership(),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .orderBy(asc(tenantMembers.firstName), asc(tenantMembers.lastName));
}

/**
 * Join requests on one group: pending first (oldest request on top so the
 * queue is fair), then declined, newest decision first. `decidedBy` is the
 * approver's display name, null when the row was never decided or the
 * approver has since been deleted.
 */
export async function listGroupJoinRequests(orgId: string, groupId: string) {
  const decider = alias(tenantMembers, "decider");

  return db
    .select({
      membershipId: groupMemberships.id,
      memberId: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      memberStatus: tenantMembers.status,
      status: groupMemberships.status,
      message: groupMemberships.requestMessage,
      requestedAt: groupMemberships.requestedAt,
      decidedAt: groupMemberships.decidedAt,
      declineReason: groupMemberships.declineReason,
      requestsBlocked: groupMemberships.requestsBlocked,
      decidedByMemberId: groupMemberships.decidedByMemberId,
      decidedByFirstName: decider.firstName,
      decidedByLastName: decider.lastName,
    })
    .from(groupMemberships)
    .innerJoin(tenantMembers, eq(tenantMembers.id, groupMemberships.memberId))
    .leftJoin(decider, eq(decider.id, groupMemberships.decidedByMemberId))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.groupId, groupId),
        inArray(groupMemberships.status, ["pending", "declined"]),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .orderBy(
      sql`case when ${groupMemberships.status} = 'pending' then 0 else 1 end`,
      sql`case when ${groupMemberships.status} = 'pending' then ${groupMemberships.requestedAt} end asc nulls last`,
      desc(groupMemberships.decidedAt),
    );
}

export type GroupJoinRequestRow = Awaited<ReturnType<typeof listGroupJoinRequests>>[number];

/** Pending join requests per group, for badges. Groups with none are absent. */
export async function listPendingRequestCounts(orgId: string, groupIds: string[]) {
  const counts = new Map<string, number>();

  if (groupIds.length === 0) {
    return counts;
  }

  const rows = await db
    .select({
      groupId: groupMemberships.groupId,
      count: sql<number>`count(*)::int`,
    })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        inArray(groupMemberships.groupId, groupIds),
        eq(groupMemberships.status, "pending"),
      ),
    )
    .groupBy(groupMemberships.groupId);

  for (const row of rows) {
    counts.set(row.groupId, row.count);
  }

  return counts;
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
  const [group, members, admins, requests, assignableMembers] = await Promise.all([
    getGroupById(orgId, groupId),
    listGroupMembers(orgId, groupId),
    listGroupAdmins(orgId, groupId),
    listGroupJoinRequests(orgId, groupId),
    listAssignableTenantMembers(orgId),
  ]);

  if (!group) {
    return null;
  }

  return {
    group,
    members,
    admins,
    requests,
    assignableMembers,
    groupLabel: getMemberDisplayName({
      firstName: group.name,
      lastName: "",
    }),
  };
}
