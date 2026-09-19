import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  type GroupPageAccessLevel,
  type PortalAvailableAction,
  type PortalLeaveBlockedReason,
  resolveAvailableAction,
  resolveGroupPageAccess,
  resolveLeave,
} from "@/lib/groups/portal-actions";
import {
  bucketGroupEvents,
  bucketGroupForms,
  type GroupEventItem as BucketedEventItem,
  type GroupFormItem as BucketedFormItem,
  memberSince,
  nextFeeRenewal,
} from "@/lib/groups/portal-group-page";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { db } from "@/server/db";
import {
  eventAudience,
  groupCategories,
  groupMemberships,
  groupResources,
  groups,
  tenantMembers,
  users,
  type GroupJoinPolicy,
  type GroupMembershipRole,
  type MemberPaymentStatus,
  type Organization,
} from "@/server/db/schema";
import { activeMembership } from "@/server/lib/group-membership";
import {
  buildGroupNotices,
  loadAdminCountByGroup,
  loadLeadersByGroup,
  type PortalGroupNotice,
  type PortalGroupPerson,
} from "@/server/lib/portal-group-summaries";
import { canManageGroup, type Viewer } from "@/lib/access/viewer";
import { requireCurrentMember } from "@/server/queries/access";
import { listEventsForViewer, type ViewerEventItem } from "@/server/queries/events";
import { listFormsForViewer, type ViewerFormItem } from "@/server/queries/forms";
import { listPendingRequestCounts } from "@/server/queries/groups";
import { listPaymentsForMember } from "@/server/queries/payments";

export type GroupEventItem = BucketedEventItem<ViewerEventItem>;
export type GroupFormItem = BucketedFormItem<ViewerFormItem>;

export type PortalGroupRosterEntry = {
  id: string;
  name: string;
  image: string | null;
  role: GroupMembershipRole;
  isYou: boolean;
};

export type PortalGroupDetail = {
  access: GroupPageAccessLevel;
  group: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    categoryId: string;
    categoryName: string;
    joinPolicy: GroupJoinPolicy;
  };
  leaders: PortalGroupPerson[];
  /** Visitors only: what they can do about the group. */
  action: PortalAvailableAction | null;
  /** Members only. */
  standing: {
    role: GroupMembershipRole;
    memberSince: Date;
    canLeave: boolean;
    leaveBlockedReason: PortalLeaveBlockedReason | null;
    isLastAdmin: boolean;
    fee: {
      amount: number;
      currency: string;
      nextRenewal: Date | null;
      payment: { status: MemberPaymentStatus; href: "/portal/payments" } | null;
    } | null;
    notices: PortalGroupNotice[];
  } | null;
  events: { upcoming: GroupEventItem[]; alsoInvited: GroupEventItem[]; past: GroupEventItem[] };
  forms: { open: GroupFormItem[]; past: GroupFormItem[] };
  announcement: { html: string; updatedAt: Date; updatedBy: string | null } | null;
  resources: Array<{ id: string; label: string; url: string }>;
  /** `null` = section hidden (visitor, or the org switch is off). */
  roster: PortalGroupRosterEntry[] | null;
  /** Group managers only. */
  leaderPanel: { pendingRequests: number; memberCount: number; adminHref: string } | null;
};

/**
 * Everything the portal group page shows, or `null` when the page does not
 * exist for this viewer — the route answers 404, never 403, so a members-only
 * page does not confirm the group exists.
 *
 * No new eligibility SQL: events, forms and payments come from the same
 * viewer-scoped queries the list page uses and are narrowed to this group by
 * the pure helpers in `lib/groups/portal-group-page.ts`. The roster is the
 * only place another member's data leaves the server, and it selects name,
 * avatar and role — nothing else.
 */
export async function getPortalGroupDetail(params: {
  viewer: Viewer;
  slug: string;
}): Promise<PortalGroupDetail | null> {
  const { viewer, slug } = params;
  const { organization } = viewer;
  const member = await requireCurrentMember(viewer);
  const orgId = organization.id;
  const memberId = member.id;

  const [row] = await db
    .select({
      group: groups,
      category: {
        id: groupCategories.id,
        name: groupCategories.name,
        isActive: groupCategories.isActive,
        groupPagesVisibleToAllMembers: groupCategories.groupPagesVisibleToAllMembers,
        selectionMode: groupCategories.selectionMode,
        maxSelections: groupCategories.maxSelections,
        selectionRequired: groupCategories.selectionRequired,
        showGroupsToNonMembers: groupCategories.showGroupsToNonMembers,
        managesMembershipFees: groupCategories.managesMembershipFees,
      },
    })
    .from(groups)
    .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
    .where(and(eq(groups.orgId, orgId), eq(groups.slug, slug)))
    .limit(1);
  if (!row) return null;
  const { group, category } = row;

  // Any status: pending / declined rows decide the visitor's action slot.
  const [myRow] = await db
    .select({
      role: groupMemberships.role,
      status: groupMemberships.status,
      requestedAt: groupMemberships.requestedAt,
      decidedAt: groupMemberships.decidedAt,
      declineReason: groupMemberships.declineReason,
      requestsBlocked: groupMemberships.requestsBlocked,
      createdAt: groupMemberships.createdAt,
    })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.groupId, group.id),
        eq(groupMemberships.memberId, memberId),
      ),
    )
    .limit(1);

  const { level: access } = resolveGroupPageAccess({
    rowStatus: myRow?.status ?? null,
    group,
    category,
  });
  if (!access) return null;
  const isMember = access === "member";

  const [
    leadersByGroup,
    viewerEvents,
    viewerForms,
    payments,
    adminCountByGroup,
    manages,
    myActiveInCategory,
    resources,
  ] = await Promise.all([
    loadLeadersByGroup({ organization, groupIds: [group.id], viewerMemberId: memberId }),
    listEventsForViewer({ orgId, memberId }),
    listFormsForViewer({ orgId, memberId }),
    listPaymentsForMember(orgId, memberId),
    isMember ? loadAdminCountByGroup(orgId, [group.id]) : new Map<string, number>(),
    canManageGroup(viewer, group),
    db
      .select({ id: groups.id, name: groups.name, joinPolicy: groups.joinPolicy })
      .from(groupMemberships)
      .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
      .where(
        and(
          eq(groupMemberships.orgId, orgId),
          eq(groupMemberships.memberId, memberId),
          activeMembership(),
          eq(groups.categoryId, category.id),
          eq(groups.isActive, true),
        ),
      ),
    db
      .select({ id: groupResources.id, label: groupResources.label, url: groupResources.url })
      .from(groupResources)
      .where(and(eq(groupResources.orgId, orgId), eq(groupResources.groupId, group.id)))
      .orderBy(asc(groupResources.sortOrder), asc(groupResources.createdAt)),
  ]);

  // Events owned elsewhere whose audience rules name this group.
  const live = [...viewerEvents.invited, ...viewerEvents.open];
  const candidateIds = live
    .filter((item) => item.event.ownerGroupId !== group.id)
    .map((item) => item.event.id);
  const invitedRows =
    candidateIds.length > 0
      ? await db
          .select({ eventId: eventAudience.eventId })
          .from(eventAudience)
          .where(
            and(
              eq(eventAudience.orgId, orgId),
              eq(eventAudience.kind, "group"),
              eq(eventAudience.groupId, group.id),
              inArray(eventAudience.eventId, candidateIds),
            ),
          )
      : [];

  const now = new Date();
  const events = bucketGroupEvents({
    groupId: group.id,
    now,
    viewer: viewerEvents,
    invitedEventIds: new Set(invitedRows.map((r) => r.eventId)),
    access,
  });
  const forms = bucketGroupForms({
    groupId: group.id,
    items: [...viewerForms.pending, ...viewerForms.submitted],
    access,
  });

  const [standing, roster, leaderPanel, announcement] = await Promise.all([
    isMember && myRow
      ? buildStanding({
          organization,
          group,
          category,
          myRow,
          myActiveInCategory,
          adminCount: adminCountByGroup.get(group.id) ?? 0,
          viewerEvents,
          payments,
          now,
        })
      : null,
    isMember && organization.showGroupRosters ? loadRoster(orgId, group.id, memberId) : null,
    manages ? loadLeaderPanel(orgId, group) : null,
    loadAnnouncement(orgId, group),
  ]);

  const action = isMember
    ? null
    : resolveAvailableAction({
        group,
        row: myRow && myRow.status !== "active" ? myRow : null,
        category,
        myActiveInCategory,
      });

  return {
    access,
    group: {
      id: group.id,
      slug: group.slug,
      name: group.name,
      description: group.description,
      categoryId: category.id,
      categoryName: category.name,
      joinPolicy: group.joinPolicy,
    },
    leaders: leadersByGroup.get(group.id) ?? [],
    action,
    standing,
    events,
    forms,
    announcement,
    resources,
    roster,
    leaderPanel,
  };
}

type GroupRow = typeof groups.$inferSelect;

async function buildStanding(params: {
  organization: Organization;
  group: GroupRow;
  category: { selectionRequired: boolean; managesMembershipFees: boolean };
  myRow: {
    role: GroupMembershipRole;
    decidedAt: Date | null;
    createdAt: Date;
  };
  myActiveInCategory: Array<{ id: string; name: string; joinPolicy: GroupJoinPolicy }>;
  adminCount: number;
  viewerEvents: Awaited<ReturnType<typeof listEventsForViewer>>;
  payments: Awaited<ReturnType<typeof listPaymentsForMember>>;
  now: Date;
}): Promise<NonNullable<PortalGroupDetail["standing"]>> {
  const { organization, group, category, myRow, myActiveInCategory, adminCount } = params;
  const leave = resolveLeave(group, category, myActiveInCategory);
  const { noticesByGroup } = buildGroupNotices({
    organization,
    viewerEvents: params.viewerEvents,
    payments: params.payments,
    now: params.now,
  });

  let fee: NonNullable<PortalGroupDetail["standing"]>["fee"] = null;
  if (category.managesMembershipFees && group.feeAmount !== null) {
    // Membership-fee payments carry no group id; the period key names the
    // group when its fee overrides the organization's (`payment-lifecycle.ts`).
    const payment = params.payments.find(
      (row) =>
        row.type === "membership_fee" &&
        row.status !== "cancelled" &&
        row.periodKey.endsWith(`:grp:${group.id}`),
    );
    const renewal =
      group.feeRenewalMonth !== null && group.feeRenewalDay !== null
        ? group
        : {
            feeRenewalMonth: organization.membershipRenewalMonth,
            feeRenewalDay: organization.membershipRenewalDay,
          };
    fee = {
      amount: group.feeAmount,
      currency: organization.membershipFeeCurrency,
      nextRenewal: nextFeeRenewal(renewal, params.now),
      payment: payment ? { status: payment.status, href: "/portal/payments" } : null,
    };
  }

  return {
    role: myRow.role,
    memberSince: memberSince(myRow),
    canLeave: leave.canLeave,
    leaveBlockedReason: leave.reason,
    isLastAdmin: myRow.role === "group_admin" && adminCount <= 1,
    fee,
    notices: noticesByGroup.get(group.id) ?? [],
  };
}

/**
 * Name, avatar and role — nothing else. Opted-out members are skipped here,
 * not hidden in the UI, so their row never reaches the client.
 */
async function loadRoster(
  orgId: string,
  groupId: string,
  viewerMemberId: string,
): Promise<PortalGroupRosterEntry[]> {
  const rows = await db
    .select({
      id: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      image: users.image,
      role: groupMemberships.role,
    })
    .from(groupMemberships)
    .innerJoin(tenantMembers, eq(tenantMembers.id, groupMemberships.memberId))
    .leftJoin(users, eq(users.id, tenantMembers.userId))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.groupId, groupId),
        activeMembership(),
        eq(tenantMembers.status, "active"),
        eq(tenantMembers.hideFromGroupRosters, false),
      ),
    )
    .orderBy(
      sql`case when ${groupMemberships.role} = 'group_admin' then 0 else 1 end`,
      asc(tenantMembers.lastName),
      asc(tenantMembers.firstName),
    );

  return rows.map((row) => ({
    id: row.id,
    name: getMemberDisplayName(row) || "Unnamed member",
    image: row.image ?? null,
    role: row.role,
    isYou: row.id === viewerMemberId,
  }));
}

async function loadLeaderPanel(
  orgId: string,
  group: { id: string; categoryId: string },
): Promise<NonNullable<PortalGroupDetail["leaderPanel"]>> {
  const [pendingCounts, [members]] = await Promise.all([
    listPendingRequestCounts(orgId, [group.id]),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(groupMemberships)
      .innerJoin(tenantMembers, eq(tenantMembers.id, groupMemberships.memberId))
      .where(
        and(
          eq(groupMemberships.orgId, orgId),
          eq(groupMemberships.groupId, group.id),
          activeMembership(),
          eq(tenantMembers.status, "active"),
        ),
      ),
  ]);

  return {
    pendingRequests: pendingCounts.get(group.id) ?? 0,
    memberCount: members?.count ?? 0,
    adminHref: `/admin/groups/${group.categoryId}/${group.id}`,
  };
}

async function loadAnnouncement(
  orgId: string,
  group: Pick<GroupRow, "announcement" | "announcementUpdatedAt" | "announcementUpdatedByMemberId">,
): Promise<PortalGroupDetail["announcement"]> {
  if (!group.announcement || !group.announcementUpdatedAt) return null;

  let updatedBy: string | null = null;
  if (group.announcementUpdatedByMemberId) {
    const [author] = await db
      .select({ firstName: tenantMembers.firstName, lastName: tenantMembers.lastName })
      .from(tenantMembers)
      .where(
        and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.id, group.announcementUpdatedByMemberId)),
      )
      .limit(1);
    updatedBy = author ? getMemberDisplayName(author) || null : null;
  }

  return { html: group.announcement, updatedAt: group.announcementUpdatedAt, updatedBy };
}
