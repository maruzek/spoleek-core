import { and, asc, eq } from "drizzle-orm";

import {
  type PortalAvailableAction,
  type PortalLeaveBlockedReason,
  resolveAvailableAction,
  resolveGroupPageAccess,
  resolveLeave,
} from "@/lib/groups/portal-actions";
import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  type GroupJoinPolicy,
  type Organization,
} from "@/server/db/schema";
import {
  buildGroupNotices,
  loadAdminCountByGroup,
  loadLeadersByGroup,
  type PortalGroupNotice,
  type PortalGroupPerson,
} from "@/server/lib/portal-group-summaries";
import { listEventsForViewer } from "@/server/queries/events";
import { listPaymentsForMember } from "@/server/queries/payments";

export type { PortalGroupNotice, PortalGroupPerson } from "@/server/lib/portal-group-summaries";

export type PortalGroup = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  joinPolicy: GroupJoinPolicy;
  /** The viewer's role in it. */
  role: "member" | "group_admin";
  /** Group admins — the people a member is meant to write to. */
  leaders: PortalGroupPerson[];
  nextEvent: { id: string; slug: string; title: string; startsAt: Date } | null;
  notices: PortalGroupNotice[];
  /** Whether the member may leave on their own; the reason key when not. */
  canLeave: boolean;
  leaveBlockedReason: PortalLeaveBlockedReason | null;
  /** True when the viewer is this group's only active admin — the leave dialog warns. */
  isLastAdmin: boolean;
};

/** A group the member is not in, with the one thing they can do about it. */
export type PortalAvailableGroup = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  joinPolicy: GroupJoinPolicy;
  leaders: PortalGroupPerson[];
  action: PortalAvailableAction;
  /** Whether `/portal/groups/[slug]` opens for this non-member. */
  canOpenPage: boolean;
};

export type PortalGroupCategory = {
  id: string;
  name: string;
  description: string | null;
  selectionMode: "single" | "multiple";
  /** Groups the viewer belongs to, in the category's own order. */
  mine: PortalGroup[];
  /** Groups the viewer could join, request, or is waiting on. */
  available: PortalAvailableGroup[];
  /** Whether the category has any active group at all. */
  hasGroups: boolean;
};

export type PortalGroupsData = {
  categories: PortalGroupCategory[];
};

/**
 * The member's groups, arranged by category — a directory, not a roster.
 *
 * Each card carries what a member actually needs from a group: who leads it,
 * what it is doing next, and anything in it that is waiting on them (an
 * unanswered invite, a fee for its trip). Categories the member has no group
 * in are still listed, in one line, so "am I meant to be in one?" is answered
 * here rather than by email.
 */
export async function getPortalGroupsData(params: {
  organization: Organization;
  memberId: string;
}): Promise<PortalGroupsData> {
  const { organization, memberId } = params;
  const orgId = organization.id;

  const [categoryRows, groupRows, myMemberships] = await Promise.all([
    db
      .select({
        id: groupCategories.id,
        name: groupCategories.name,
        description: groupCategories.description,
        selectionMode: groupCategories.selectionMode,
        maxSelections: groupCategories.maxSelections,
        selectionRequired: groupCategories.selectionRequired,
        showGroupsToNonMembers: groupCategories.showGroupsToNonMembers,
        groupPagesVisibleToAllMembers: groupCategories.groupPagesVisibleToAllMembers,
        isActive: groupCategories.isActive,
      })
      .from(groupCategories)
      .where(and(eq(groupCategories.orgId, orgId), eq(groupCategories.isActive, true)))
      .orderBy(asc(groupCategories.sortOrder), asc(groupCategories.name)),
    db
      .select({
        id: groups.id,
        categoryId: groups.categoryId,
        slug: groups.slug,
        name: groups.name,
        description: groups.description,
        joinPolicy: groups.joinPolicy,
        pageVisibility: groups.pageVisibility,
        isActive: groups.isActive,
      })
      .from(groups)
      .where(and(eq(groups.orgId, orgId), eq(groups.isActive, true)))
      .orderBy(asc(groups.sortOrder), asc(groups.name)),
    db
      // Deliberately no activeMembership(): this page renders the member's
      // pending / declined requests as well, so it reads every status.
      .select({
        groupId: groupMemberships.groupId,
        role: groupMemberships.role,
        status: groupMemberships.status,
        requestedAt: groupMemberships.requestedAt,
        decidedAt: groupMemberships.decidedAt,
        declineReason: groupMemberships.declineReason,
        requestsBlocked: groupMemberships.requestsBlocked,
      })
      .from(groupMemberships)
      .where(and(eq(groupMemberships.orgId, orgId), eq(groupMemberships.memberId, memberId))),
  ]);

  const myRowByGroup = new Map(myMemberships.map((row) => [row.groupId, row]));
  const myRole = new Map(
    myMemberships.filter((row) => row.status === "active").map((row) => [row.groupId, row.role]),
  );
  const myGroupIds = [...myRole.keys()];

  // Leaders are shown on the member's own cards and on "ask a leader" cards,
  // so they are loaded for every visible group in one go.
  const visibleGroupIds = groupRows
    .filter((group) => {
      if (myRole.has(group.id) || myRowByGroup.has(group.id)) return true;
      if (group.joinPolicy !== "admin_only") return true;
      return categoryRows.some((c) => c.id === group.categoryId && c.showGroupsToNonMembers);
    })
    .map((group) => group.id);

  const [leadersByGroup, adminCountByGroup, viewerEvents, payments] = await Promise.all([
    loadLeadersByGroup({ organization, groupIds: visibleGroupIds, viewerMemberId: memberId }),
    loadAdminCountByGroup(orgId, myGroupIds),
    listEventsForViewer({ orgId, memberId }),
    listPaymentsForMember(orgId, memberId),
  ]);

  const { noticesByGroup, nextEventByGroup } = buildGroupNotices({
    organization,
    viewerEvents,
    payments,
    now: new Date(),
  });

  const categories: PortalGroupCategory[] = categoryRows
    .map((category) => {
      const inCategory = groupRows.filter((group) => group.categoryId === category.id);
      const myActiveInCategory = inCategory
        .filter((group) => myRole.has(group.id))
        .map((group) => ({ id: group.id, name: group.name, joinPolicy: group.joinPolicy }));

      const mine: PortalGroup[] = inCategory
        .filter((group) => myRole.has(group.id))
        .map((group) => {
          const role = myRole.get(group.id) ?? "member";
          const leave = resolveLeave(group, category, myActiveInCategory);
          return {
            id: group.id,
            slug: group.slug,
            name: group.name,
            description: group.description,
            joinPolicy: group.joinPolicy,
            role,
            leaders: leadersByGroup.get(group.id) ?? [],
            nextEvent: nextEventByGroup.get(group.id) ?? null,
            notices: noticesByGroup.get(group.id) ?? [],
            canLeave: leave.canLeave,
            leaveBlockedReason: leave.reason,
            isLastAdmin: role === "group_admin" && (adminCountByGroup.get(group.id) ?? 0) <= 1,
          };
        });

      const available: PortalAvailableGroup[] = inCategory
        .filter((group) => !myRole.has(group.id))
        .flatMap((group) => {
          const row = myRowByGroup.get(group.id) ?? null;
          const action = resolveAvailableAction({
            group,
            row: row && row.status !== "active" ? row : null,
            category,
            myActiveInCategory,
          });
          if (!action) return [];
          return [
            {
              id: group.id,
              slug: group.slug,
              name: group.name,
              description: group.description,
              joinPolicy: group.joinPolicy,
              leaders: leadersByGroup.get(group.id) ?? [],
              action,
              canOpenPage:
                resolveGroupPageAccess({ rowStatus: row?.status ?? null, group, category }).level !==
                null,
            },
          ];
        });

      return {
        id: category.id,
        name: category.name,
        description: category.description,
        selectionMode: category.selectionMode,
        mine,
        available,
        hasGroups: inCategory.length > 0,
      };
    })
    // A category with no groups at all has nothing to say to a member.
    .filter((category) => category.hasGroups);

  return { categories };
}
