import { and, eq, ne, or } from "drizzle-orm";
import { forbidden, redirect } from "next/navigation";

import type { AppCapabilities, AppShellContext } from "@/lib/app-shell";
import { db } from "@/server/db";
import {
  categoryAdminAssignments,
  groupCategories,
  groupMemberships,
  groups,
  tenantMembers,
  users,
} from "@/server/db/schema";
import { getAppOrganization } from "@/server/queries/app";
import { getPostApprovalCompleteness } from "@/server/queries/member-custom-fields";
import { requireViewerSession } from "@/server/queries/auth";

export async function requireOrganization() {
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  return organization;
}

export async function getCurrentMember(userId: string) {
  const organization = await requireOrganization();
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, organization.id),
        eq(tenantMembers.userId, userId),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  return member ?? null;
}

function getCapabilities({
  hasActiveMember,
  hasScopedGroupManagement,
  hasScopedMemberManagement,
  memberRole,
  systemRole,
}: {
  hasActiveMember: boolean;
  hasScopedGroupManagement: boolean;
  hasScopedMemberManagement: boolean;
  memberRole: "member" | "leader" | "org_admin" | null;
  systemRole: "member" | "system_admin";
}): { adminAccessLevel: AppShellContext["adminAccessLevel"]; capabilities: AppCapabilities } {
  if (systemRole === "system_admin") {
    return {
      adminAccessLevel: "full",
      capabilities: {
        canAccessPortal: hasActiveMember,
        canAccessAdmin: true,
        canManageGroups: true,
        canManageOrganization: true,
        canManageMembers: true,
        canManageScopedMembers: true,
        canManageEvents: true,
        canManagePayments: true,
      },
    };
  }

  if (hasActiveMember && memberRole === "org_admin") {
    return {
      adminAccessLevel: "full",
      capabilities: {
        canAccessPortal: true,
        canAccessAdmin: true,
        canManageGroups: true,
        canManageOrganization: true,
        canManageMembers: true,
        canManageScopedMembers: true,
        canManageEvents: true,
        canManagePayments: true,
      },
    };
  }

  if (hasActiveMember && memberRole === "leader") {
    return {
      adminAccessLevel: "scoped",
      capabilities: {
        canAccessPortal: true,
        canAccessAdmin: true,
        canManageGroups: true,
        canManageOrganization: false,
        canManageMembers: false,
        canManageScopedMembers: hasScopedMemberManagement,
        canManageEvents: true,
        canManagePayments: false,
      },
    };
  }

  if (hasActiveMember && hasScopedGroupManagement) {
    return {
      adminAccessLevel: "scoped",
      capabilities: {
        canAccessPortal: true,
        canAccessAdmin: true,
        canManageGroups: true,
        canManageOrganization: false,
        canManageMembers: false,
        canManageScopedMembers: hasScopedMemberManagement,
        canManageEvents: false,
        canManagePayments: false,
      },
    };
  }

  return {
    adminAccessLevel: "none",
    capabilities: {
      canAccessPortal: hasActiveMember,
      canAccessAdmin: false,
      canManageGroups: false,
      canManageOrganization: false,
      canManageMembers: false,
      canManageScopedMembers: false,
      canManageEvents: false,
      canManagePayments: false,
    },
  };
}

export async function getViewerAppContext(): Promise<
  AppShellContext & {
    memberRecordId: string | null;
    organizationId: string;
    session: Awaited<ReturnType<typeof requireViewerSession>>;
  }
> {
  const session = await requireViewerSession();
  const organization = await requireOrganization();

  const [user] = await db
    .select({ systemRole: users.systemRole })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, organization.id),
        eq(tenantMembers.userId, session.user.id),
        ne(tenantMembers.status, "deleted"),
      ),
    )
    .limit(1);

  const hasActiveMember = member?.status === "active";
  const hasScopedGroupManagement =
    hasActiveMember && member
      ? await hasScopedGroupManagementAccess(organization.id, member.id)
      : false;
  const hasScopedMemberManagement =
    hasActiveMember && member
      ? await hasScopedMemberManagementAccess(organization.id, member.id)
      : false;
  const { adminAccessLevel, capabilities } = getCapabilities({
    hasActiveMember,
    hasScopedGroupManagement,
    hasScopedMemberManagement,
    memberRole: member?.role ?? null,
    systemRole: user?.systemRole ?? "member",
  });

  return {
    session,
    organizationId: organization.id,
    memberRecordId: member?.id ?? null,
    organization: {
      name: organization.name,
      slug: organization.slug,
    },
    viewer: {
      name: session.user.name,
      email: session.user.email,
      avatar: session.user.image ?? null,
    },
    member: member
      ? {
          role: member.role,
          status: member.status,
        }
      : null,
    adminAccessLevel,
    capabilities,
    visibleSections: [
      ...(capabilities.canAccessPortal ? (["portal"] as const) : []),
      ...(capabilities.canAccessAdmin ? (["admin"] as const) : []),
    ],
  };
}

async function hasScopedGroupManagementAccess(orgId: string, memberId: string) {
  const [assignment] = await db
    .select({ memberId: tenantMembers.id })
    .from(tenantMembers)
    .leftJoin(
      categoryAdminAssignments,
      and(
        eq(categoryAdminAssignments.orgId, orgId),
        eq(categoryAdminAssignments.memberId, tenantMembers.id),
      ),
    )
    .leftJoin(
      groupMemberships,
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.memberId, tenantMembers.id),
        eq(groupMemberships.role, "group_admin"),
      ),
    )
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        eq(tenantMembers.id, memberId),
        or(
          eq(groupMemberships.role, "group_admin"),
          eq(categoryAdminAssignments.memberId, memberId),
        ),
      ),
    )
    .limit(1);

  return assignment != null;
}

async function hasScopedMemberManagementAccess(orgId: string, memberId: string) {
  const [assignment] = await db
    .select({ memberId: tenantMembers.id })
    .from(tenantMembers)
    .innerJoin(
      groupMemberships,
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.memberId, tenantMembers.id),
        eq(groupMemberships.role, "group_admin"),
      ),
    )
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        eq(tenantMembers.id, memberId),
        eq(groupCategories.groupAdminsManageMembers, true),
        eq(groupCategories.isActive, true),
        eq(groups.isActive, true),
      ),
    )
    .limit(1);

  return assignment != null;
}

export async function listScopedCategoryIds(orgId: string, memberId: string) {
  const rows = await db
    .select({ categoryId: categoryAdminAssignments.categoryId })
    .from(categoryAdminAssignments)
    .where(
      and(
        eq(categoryAdminAssignments.orgId, orgId),
        eq(categoryAdminAssignments.memberId, memberId),
      ),
    );

  return rows.map((row) => row.categoryId);
}

export async function listScopedGroupIds(orgId: string, memberId: string) {
  const rows = await db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.memberId, memberId),
        eq(groupMemberships.role, "group_admin"),
      ),
    );

  return rows.map((row) => row.groupId);
}

export async function listAccessibleCategoryIds(orgId: string, memberId: string) {
  const [categoryIds, groupRows] = await Promise.all([
    listScopedCategoryIds(orgId, memberId),
    db
      .select({ categoryId: groups.categoryId })
      .from(groupMemberships)
      .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
      .where(
        and(
          eq(groupMemberships.orgId, orgId),
          eq(groupMemberships.memberId, memberId),
          eq(groupMemberships.role, "group_admin"),
        ),
      ),
  ]);

  return [...new Set([...categoryIds, ...groupRows.map((row) => row.categoryId)])];
}

export async function requireGroupAdminModuleAccess() {
  const context = await requireAdminAccess({ capability: "canManageGroups" });

  return context;
}

export async function requireCategoryOverviewAccess(categoryId: string) {
  const context = await requireGroupAdminModuleAccess();

  if (context.adminAccessLevel === "full" || context.member?.role === "leader") {
    return context;
  }

  if (!context.member) {
    forbidden();
  }

  const scopedCategoryIds = await listAccessibleCategoryIds(
    context.organization.id,
    context.member.id,
  );

  if (!scopedCategoryIds.includes(categoryId)) {
    forbidden();
  }

  return context;
}

export async function requireCategoryManagementAccess(categoryId: string) {
  const context = await requireGroupAdminModuleAccess();

  if (context.adminAccessLevel === "full" || context.member?.role === "leader") {
    return context;
  }

  if (!context.member) {
    forbidden();
  }

  const scopedCategoryIds = await listScopedCategoryIds(context.organization.id, context.member.id);

  if (!scopedCategoryIds.includes(categoryId)) {
    forbidden();
  }

  return context;
}

export async function requireGroupManagementAccess(groupId: string) {
  const context = await requireGroupAdminModuleAccess();

  if (context.adminAccessLevel === "full" || context.member?.role === "leader") {
    return context;
  }

  if (!context.member) {
    forbidden();
  }

  const [group] = await db
    .select({ id: groups.id, categoryId: groups.categoryId })
    .from(groups)
    .where(and(eq(groups.orgId, context.organization.id), eq(groups.id, groupId)))
    .limit(1);

  if (!group) {
    forbidden();
  }

  const [scopedCategoryIds, scopedGroupIds] = await Promise.all([
    listScopedCategoryIds(context.organization.id, context.member.id),
    listScopedGroupIds(context.organization.id, context.member.id),
  ]);

  if (!scopedCategoryIds.includes(group.categoryId) && !scopedGroupIds.includes(group.id)) {
    forbidden();
  }

  return context;
}

export async function requireCurrentMemberAccess(options?: {
  requireProfileComplete?: boolean;
}) {
  const session = await requireViewerSession();
  const organization = await requireOrganization();
  const member = await getCurrentMember(session.user.id);

  if (!member) {
    redirect("/join");
  }

  if (options?.requireProfileComplete && member.status === "active") {
    const completeness = await getPostApprovalCompleteness(organization.id, member.id);

    if (!completeness.isComplete) {
      redirect("/portal/profile?incomplete=1");
    }
  }

  return {
    session,
    organization,
    member,
  };
}

export async function requireCurrentMember() {
  const { member } = await requireCurrentMemberAccess();
  return member;
}

export async function requireAdminAccess(options?: {
  capability?: keyof AppCapabilities;
  requireFullAccess?: boolean;
}) {
  const appContext = await getViewerAppContext();
  const organization = await requireOrganization();
  const member = await getCurrentMember(appContext.session.user.id);

  if (!appContext.capabilities.canAccessAdmin) {
    forbidden();
  }

  if (options?.requireFullAccess && appContext.adminAccessLevel !== "full") {
    forbidden();
  }

  if (options?.capability && !appContext.capabilities[options.capability]) {
    forbidden();
  }

  return {
    ...appContext,
    organization,
    member,
  };
}

export async function requireOrgAdminAccess(userId?: string) {
  if (userId) {
    const organization = await requireOrganization();

    const [user] = await db
      .select({ systemRole: users.systemRole })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.systemRole === "system_admin") {
      return { organization, member: null };
    }

    const [member] = await db
      .select()
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.orgId, organization.id),
          eq(tenantMembers.userId, userId),
          ne(tenantMembers.status, "deleted"),
        ),
      )
      .limit(1);

    if (!member || member.status !== "active" || member.role !== "org_admin") {
      forbidden();
    }

    return { organization, member };
  }

  const { organization, member } = await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  return { organization, member };
}
