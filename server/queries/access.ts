import { and, eq, isNull, ne, or } from "drizzle-orm";
import { forbidden, notFound, redirect } from "next/navigation";

import type {
  AppCapabilities,
  AppShellAdminGroupPin,
  AppShellContext,
} from "@/lib/app-shell";
import { db } from "@/server/db";
import {
  categoryAdminAssignments,
  events,
  forms,
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  tenantMembers,
  users,
  type Event,
  type EventOwnerType,
  type Organization,
  type TenantMember,
} from "@/server/db/schema";
import { getAppOrganization } from "@/server/queries/app";
import { getPostApprovalCompleteness } from "@/server/queries/member-custom-fields";
import { listOutstandingPolicies } from "@/server/queries/policies";
import { requireViewerSession } from "@/server/queries/auth";
import { listPinnedGroupCategoriesForSidebar } from "@/server/queries/groups";
import { activeMembership } from "@/server/lib/group-membership";

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
        canManagePayments: true,
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
    /** Platform operator, not just an org admin. Gates provider-wide data. */
    isSystemAdmin: boolean;
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
  const navigation = capabilities.canManageGroups
    ? await getAdminGroupPins({
        adminAccessLevel,
        memberId: member?.id ?? null,
        memberRole: member?.role ?? null,
        orgId: organization.id,
      })
    : { adminGroupPins: [] };

  return {
    session,
    organizationId: organization.id,
    memberRecordId: member?.id ?? null,
    isSystemAdmin: user?.systemRole === "system_admin",
    organization: {
      name: organization.name,
      slug: organization.slug,
      membershipManagementMode: organization.membershipManagementMode,
      defaultEmailPreference: organization.defaultEmailPreference,
      fees: {
        enabled: organization.membershipFeeEnabled,
        renewalMonth: organization.membershipRenewalMonth,
        renewalDay: organization.membershipRenewalDay,
        feeAmount: organization.membershipFeeAmount,
        feeCurrency: organization.membershipFeeCurrency,
        feeBankAccount: organization.membershipFeeBankAccount,
        paymentWindowDays: organization.membershipFeePaymentWindowDays,
      },
      membershipReportEnabled: organization.membershipReportEnabled,
    },
    viewer: {
      name: session.user.name,
      email: session.user.email,
      avatar: session.user.image ?? null,
    },
    member: member
      ? {
          id: member.id,
          role: member.role,
          status: member.status,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
        }
      : null,
    adminAccessLevel,
    capabilities,
    visibleSections: [
      ...(capabilities.canAccessPortal ? (["portal"] as const) : []),
      ...(capabilities.canAccessAdmin ? (["admin"] as const) : []),
    ],
    navigation,
  };
}

async function getAdminGroupPins({
  adminAccessLevel,
  memberId,
  memberRole,
  orgId,
}: {
  adminAccessLevel: AppShellContext["adminAccessLevel"];
  memberId: string | null;
  memberRole: "member" | "leader" | "org_admin" | null;
  orgId: string;
}): Promise<AppShellContext["navigation"]> {
  const hasFullVisibility =
    adminAccessLevel === "full" || memberRole === "leader" || memberId == null;

  const [rows, scopedCategoryIds, scopedGroupIds] = await Promise.all([
    listPinnedGroupCategoriesForSidebar(orgId),
    hasFullVisibility || memberId == null ? null : listAccessibleCategoryIds(orgId, memberId),
    hasFullVisibility || memberId == null ? null : listScopedGroupIds(orgId, memberId),
  ]);

  const visibleCategoryIds = scopedCategoryIds == null ? null : new Set(scopedCategoryIds);
  const visibleGroupIds = scopedGroupIds == null ? null : new Set(scopedGroupIds);
  const pins = new Map<string, AppShellAdminGroupPin>();

  for (const row of rows) {
    const canSeeCategory = visibleCategoryIds == null || visibleCategoryIds.has(row.categoryId);
    const canSeeGroup =
      row.groupId == null ||
      canSeeCategory ||
      (visibleGroupIds != null && visibleGroupIds.has(row.groupId));

    if (!canSeeGroup) {
      continue;
    }

    const existingPin = pins.get(row.categoryId);

    if (!existingPin) {
      pins.set(row.categoryId, {
        id: row.categoryId,
        title: row.categoryName,
        href: `/admin/groups/${row.categoryId}`,
        groups: row.groupId
          ? [
              {
                id: row.groupId,
                title: row.groupName ?? "Untitled group",
                href: `/admin/groups/${row.categoryId}/${row.groupId}`,
              },
            ]
          : [],
      });
      continue;
    }

    if (row.groupId) {
      existingPin.groups.push({
        id: row.groupId,
        title: row.groupName ?? "Untitled group",
        href: `/admin/groups/${row.categoryId}/${row.groupId}`,
      });
    }
  }

  return {
    adminGroupPins: [...pins.values()],
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
        activeMembership(),
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
        activeMembership(),
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
        activeMembership(),
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
          activeMembership(),
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

/**
 * Non-throwing twin of `requireGroupManagementAccess` for pages that show a
 * manager-only panel to some viewers and nothing to the rest. Same rule: org
 * admins, leaders and system admins manage every group; otherwise the member
 * must be a category admin over its category or a group admin of the group.
 */
export async function canManageGroup(params: {
  orgId: string;
  member: Pick<TenantMember, "id" | "role" | "status" | "userId">;
  group: { id: string; categoryId: string };
}): Promise<boolean> {
  const { orgId, member, group } = params;
  if (member.status !== "active") return false;
  if (member.role === "org_admin" || member.role === "leader") return true;

  const [scopedCategoryIds, scopedGroupIds] = await Promise.all([
    listScopedCategoryIds(orgId, member.id),
    listScopedGroupIds(orgId, member.id),
  ]);
  if (scopedCategoryIds.includes(group.categoryId) || scopedGroupIds.includes(group.id)) {
    return true;
  }

  if (!member.userId) return false;
  const [user] = await db
    .select({ systemRole: users.systemRole })
    .from(users)
    .where(eq(users.id, member.userId))
    .limit(1);
  return user?.systemRole === "system_admin";
}

/**
 * A Workspace link writes to Google, so it stays behind the org-admin gate even
 * in categories where `groupAdminsManageMembers` lets group admins manage the
 * roster. Same gate for the drift inbox: adopting or removing a drift row moves
 * membership on one side or the other.
 */
export async function requireWorkspaceLinkAccess(groupId: string) {
  const context = await requireGroupManagementAccess(groupId);

  if (context.adminAccessLevel !== "full" && context.member?.role !== "leader") {
    throw new Error(
      "Only organization admins can change the Workspace link for a group.",
    );
  }

  return context;
}

/**
 * Sends a member to `/portal/legal` while any published document is unanswered.
 *
 * Status is deliberately not narrowed to `active`. The gate used to fire only
 * for active members, which meant an org admin working entirely inside `/admin`
 * — and anyone suspended or archived who could still reach a signed-in page —
 * never saw a policy prompt and never produced an acknowledgement row. The
 * people handling everyone else's data were the only ones with no record of
 * having been informed. `getCurrentMember` already excludes deleted members, so
 * every status arriving here is one that reaches a real surface.
 *
 * `/portal/legal` calls the member guard with no options, so the page that
 * clears the block cannot redirect to itself.
 */
async function redirectIfPoliciesOutstanding(orgId: string, memberId: string) {
  const outstanding = await listOutstandingPolicies(orgId, memberId);

  if (outstanding.length > 0) {
    redirect("/portal/legal");
  }
}

export async function requireCurrentMemberAccess(options?: {
  requireProfileComplete?: boolean;
  requirePolicyAcknowledgement?: boolean;
}) {
  const session = await requireViewerSession();
  const organization = await requireOrganization();
  const member = await getCurrentMember(session.user.id);

  if (!member) {
    // A system admin can legitimately have no membership (the first-run wizard
    // can create one without it), so send them to admin rather than to signup.
    const [user] = await db
      .select({ systemRole: users.systemRole })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    redirect(user?.systemRole === "system_admin" ? "/admin" : "/join");
  }

  // Deliberately ahead of the profile check: nobody should be asked to fill in
  // custom fields before being told how their data is handled. A legal
  // obligation outranks profile hygiene.
  if (options?.requirePolicyAcknowledgement) {
    await redirectIfPoliciesOutstanding(organization.id, member.id);
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

  // Admins are data subjects too, and they are the ones handling everybody
  // else's record. A system admin with no membership has nothing to answer for
  // and is left alone.
  if (member) {
    await redirectIfPoliciesOutstanding(organization.id, member.id);
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

// ─── Events ─────────────────────────────────────────────────────────────────

/**
 * Who may manage an event, decided by its owner.
 *
 * `group` and `category` owners reuse the existing group/category guards. An
 * `organization` owner is gated by `organizations.orgEventCreators`, so a
 * federation can let every troop leader post org-wide without making them org
 * admins. Used both before a row exists (create) and after (everything else,
 * through `requireEventManagementAccess`).
 */
export async function requireEventOwnerAccess(
  ownerType: EventOwnerType,
  ownerId?: string | null,
) {
  if (ownerType === "group") {
    if (!ownerId) forbidden();
    return requireGroupManagementAccess(ownerId);
  }

  if (ownerType === "category") {
    if (!ownerId) forbidden();
    return requireCategoryManagementAccess(ownerId);
  }

  const context = await requireGroupAdminModuleAccess();

  if (context.adminAccessLevel === "full" || context.member?.role === "leader") {
    return context;
  }

  const setting = context.organization.orgEventCreators;

  if (setting === "org_admins" || !context.member) {
    forbidden();
  }

  const scopedCategoryIds = await listScopedCategoryIds(
    context.organization.id,
    context.member.id,
  );

  if (scopedCategoryIds.length > 0) {
    return context;
  }

  if (setting === "any_admin") {
    const scopedGroupIds = await listScopedGroupIds(
      context.organization.id,
      context.member.id,
    );

    if (scopedGroupIds.length > 0) {
      return context;
    }
  }

  forbidden();
}

/**
 * Non-throwing twin of `requireEventOwnerAccess`, for the portal event page
 * that shows a "manage" link to whoever could open the admin record. Same
 * rules: group and category events follow their owner's management access;
 * org-wide events go to full admins and leaders, then to category admins,
 * then — when the org allows any admin — to group admins.
 */
export async function canManageEvent(params: {
  organization: Pick<Organization, "id" | "orgEventCreators">;
  member: Pick<TenantMember, "id" | "role" | "status" | "userId">;
  event: Pick<Event, "ownerType" | "ownerGroupId" | "ownerCategoryId">;
}): Promise<boolean> {
  const { organization, member, event } = params;
  if (member.status !== "active") return false;

  if (event.ownerType === "group") {
    if (!event.ownerGroupId) return false;
    const [group] = await db
      .select({ id: groups.id, categoryId: groups.categoryId })
      .from(groups)
      .where(and(eq(groups.orgId, organization.id), eq(groups.id, event.ownerGroupId)))
      .limit(1);
    return group ? canManageGroup({ orgId: organization.id, member, group }) : false;
  }

  if (member.role === "org_admin" || member.role === "leader") return true;
  if (member.userId) {
    const [user] = await db
      .select({ systemRole: users.systemRole })
      .from(users)
      .where(eq(users.id, member.userId))
      .limit(1);
    if (user?.systemRole === "system_admin") return true;
  }

  if (event.ownerType === "category") {
    if (!event.ownerCategoryId) return false;
    const scopedCategoryIds = await listScopedCategoryIds(organization.id, member.id);
    return scopedCategoryIds.includes(event.ownerCategoryId);
  }

  if (organization.orgEventCreators === "org_admins") return false;
  const scopedCategoryIds = await listScopedCategoryIds(organization.id, member.id);
  if (scopedCategoryIds.length > 0) return true;
  if (organization.orgEventCreators !== "any_admin") return false;
  const scopedGroupIds = await listScopedGroupIds(organization.id, member.id);
  return scopedGroupIds.length > 0;
}

/** Loads a live event in the current org and checks management access to its owner. */
export async function requireEventManagementAccess(eventId: string) {
  const organization = await requireOrganization();

  const [event] = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.orgId, organization.id),
        eq(events.id, eventId),
        isNull(events.deletedAt),
      ),
    )
    .limit(1);

  if (!event) {
    forbidden();
  }

  const context = await requireEventOwnerAccess(
    event.ownerType,
    event.ownerType === "group" ? event.ownerGroupId : event.ownerCategoryId,
  );

  return { context, event };
}

/**
 * Whoever manages the event manages its payments: mark paid, cancel, mark
 * refunded from the response list need no `canManagePayments`. Resolves the
 * payment to its event and dispatches to `requireEventManagementAccess`.
 */
export async function requireEventPaymentAccess(paymentId: string) {
  const organization = await requireOrganization();

  const [payment] = await db
    .select()
    .from(memberPayments)
    .where(
      and(
        eq(memberPayments.orgId, organization.id),
        eq(memberPayments.id, paymentId),
        eq(memberPayments.type, "event"),
      ),
    )
    .limit(1);

  if (!payment || !payment.eventId) {
    notFound();
  }

  const access = await requireEventManagementAccess(payment.eventId);
  return { ...access, payment };
}

// ─── Forms ──────────────────────────────────────────────────────────────────

/**
 * Same owner table as events: a form is managed by whoever manages its
 * owner. Thin alias so the two cannot drift.
 */
export async function requireFormOwnerAccess(
  ownerType: EventOwnerType,
  ownerId?: string | null,
) {
  return requireEventOwnerAccess(ownerType, ownerId);
}

/**
 * Loads a live form in the current org and checks management access.
 *
 * Templates are org-wide: every manager may read one (to copy it), only org
 * admins may change or delete it. Everything else dispatches on the owner.
 */
export async function requireFormManagementAccess(
  formId: string,
  options: { write?: boolean } = {},
) {
  const organization = await requireOrganization();

  const [form] = await db
    .select()
    .from(forms)
    .where(
      and(eq(forms.orgId, organization.id), eq(forms.id, formId), isNull(forms.deletedAt)),
    )
    .limit(1);

  if (!form) {
    forbidden();
  }

  if (form.isTemplate) {
    const context = await requireGroupAdminModuleAccess();
    if (options.write && !context.capabilities.canManageOrganization) {
      forbidden();
    }
    return { context, form };
  }

  const context = await requireFormOwnerAccess(
    form.ownerType,
    form.ownerType === "group" ? form.ownerGroupId : form.ownerCategoryId,
  );

  return { context, form };
}

/** Attaching or detaching needs management access to both sides. */
export async function requireFormAttachAccess(formId: string, eventId: string) {
  const [{ context, form }, { event }] = await Promise.all([
    requireFormManagementAccess(formId, { write: true }),
    requireEventManagementAccess(eventId),
  ]);
  return { context, form, event };
}

/**
 * The owners the viewer may create events for, which is also the filter for
 * the admin event list. Org-wide access is a boolean; scoped access lists ids.
 */
export async function listManageableOwners(
  context: Awaited<ReturnType<typeof requireGroupAdminModuleAccess>>,
): Promise<{ organization: boolean; categoryIds: string[]; groupIds: string[] }> {
  if (context.adminAccessLevel === "full" || context.member?.role === "leader") {
    const [categoryRows, groupRows] = await Promise.all([
      db
        .select({ id: groupCategories.id })
        .from(groupCategories)
        .where(eq(groupCategories.orgId, context.organization.id)),
      db
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.orgId, context.organization.id)),
    ]);

    return {
      organization: true,
      categoryIds: categoryRows.map((row) => row.id),
      groupIds: groupRows.map((row) => row.id),
    };
  }

  if (!context.member) {
    return { organization: false, categoryIds: [], groupIds: [] };
  }

  const [scopedCategoryIds, scopedGroupIds] = await Promise.all([
    listScopedCategoryIds(context.organization.id, context.member.id),
    listScopedGroupIds(context.organization.id, context.member.id),
  ]);

  // A category admin manages every group in the category, so those groups are
  // manageable owners too.
  const categoryGroupRows =
    scopedCategoryIds.length > 0
      ? await db
          .select({ id: groups.id })
          .from(groups)
          .where(
            and(
              eq(groups.orgId, context.organization.id),
              or(...scopedCategoryIds.map((id) => eq(groups.categoryId, id))),
            ),
          )
      : [];

  const setting = context.organization.orgEventCreators;
  const organization =
    (setting === "category_admins" && scopedCategoryIds.length > 0) ||
    (setting === "any_admin" &&
      (scopedCategoryIds.length > 0 || scopedGroupIds.length > 0));

  return {
    organization,
    categoryIds: scopedCategoryIds,
    groupIds: [...new Set([...scopedGroupIds, ...categoryGroupRows.map((row) => row.id)])],
  };
}
