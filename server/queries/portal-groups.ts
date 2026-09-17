import { and, asc, eq, inArray } from "drizzle-orm";

import { isRsvpOpen } from "@/lib/events/rsvp";
import { orgFormatLocale } from "@/lib/i18n";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { formatMoney, getPaymentTitle } from "@/lib/payments";
import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  tenantMembers,
  type GroupJoinPolicy,
  type Organization,
} from "@/server/db/schema";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import { listEventsForViewer } from "@/server/queries/events";
import { listPaymentsForMember } from "@/server/queries/payments";

export type PortalGroupPerson = {
  id: string;
  name: string;
  email: string | null;
  isYou: boolean;
};

/** Something in this group that is waiting on the member. */
export type PortalGroupNotice = {
  id: string;
  kind: "rsvp_needed" | "payment_overdue" | "payment_due" | "refund_due";
  title: string;
  detail: string;
  href: string;
  urgent: "error" | "warning" | null;
};

export type PortalGroup = {
  id: string;
  name: string;
  description: string | null;
  joinPolicy: GroupJoinPolicy;
  /** The viewer's role in it. */
  role: "member" | "group_admin";
  /** Group admins — the people a member is meant to write to. */
  leaders: PortalGroupPerson[];
  nextEvent: { id: string; slug: string; title: string; startsAt: Date } | null;
  notices: PortalGroupNotice[];
};

export type PortalGroupCategory = {
  id: string;
  name: string;
  description: string | null;
  selectionMode: "single" | "multiple";
  /** Groups the viewer belongs to, in the category's own order. */
  mine: PortalGroup[];
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
      })
      .from(groupCategories)
      .where(and(eq(groupCategories.orgId, orgId), eq(groupCategories.isActive, true)))
      .orderBy(asc(groupCategories.sortOrder), asc(groupCategories.name)),
    db
      .select({
        id: groups.id,
        categoryId: groups.categoryId,
        name: groups.name,
        description: groups.description,
        joinPolicy: groups.joinPolicy,
      })
      .from(groups)
      .where(and(eq(groups.orgId, orgId), eq(groups.isActive, true)))
      .orderBy(asc(groups.sortOrder), asc(groups.name)),
    db
      .select({ groupId: groupMemberships.groupId, role: groupMemberships.role })
      .from(groupMemberships)
      .where(and(eq(groupMemberships.orgId, orgId), eq(groupMemberships.memberId, memberId))),
  ]);

  const myRole = new Map(myMemberships.map((row) => [row.groupId, row.role]));
  const myGroupIds = [...myRole.keys()];

  const [leaderRows, viewerEvents, payments] = await Promise.all([
    myGroupIds.length > 0
      ? db
          .select({
            groupId: groupMemberships.groupId,
            memberId: tenantMembers.id,
            firstName: tenantMembers.firstName,
            lastName: tenantMembers.lastName,
            email: tenantMembers.email,
            workspaceUserEmail: tenantMembers.workspaceUserEmail,
            preferredEmail: tenantMembers.preferredEmail,
            role: groupMemberships.role,
          })
          .from(groupMemberships)
          .innerJoin(tenantMembers, eq(tenantMembers.id, groupMemberships.memberId))
          .where(
            and(
              eq(groupMemberships.orgId, orgId),
              inArray(groupMemberships.groupId, myGroupIds),
              eq(groupMemberships.role, "group_admin"),
              eq(tenantMembers.status, "active"),
            ),
          )
          .orderBy(asc(tenantMembers.lastName), asc(tenantMembers.firstName))
      : Promise.resolve([]),
    listEventsForViewer({ orgId, memberId }),
    listPaymentsForMember(orgId, memberId),
  ]);

  const leadersByGroup = new Map<string, PortalGroupPerson[]>();
  for (const row of leaderRows) {
    const person: PortalGroupPerson = {
      id: row.memberId,
      name: getMemberDisplayName(row) || "Unnamed member",
      email: resolveMemberEmailForOrg({ member: row, organization }),
      isYou: row.memberId === memberId,
    };
    leadersByGroup.set(row.groupId, [...(leadersByGroup.get(row.groupId) ?? []), person]);
  }

  const now = new Date();
  const locale = orgFormatLocale(organization.locale);
  const nextEventByGroup = new Map<string, PortalGroup["nextEvent"]>();
  const noticesByGroup = new Map<string, PortalGroupNotice[]>();
  const pushNotice = (groupId: string, notice: PortalGroupNotice) =>
    noticesByGroup.set(groupId, [...(noticesByGroup.get(groupId) ?? []), notice]);

  // Which group a payment belongs to is the group that owns its event.
  const groupByEvent = new Map<string, string>();
  for (const item of [...viewerEvents.invited, ...viewerEvents.open, ...viewerEvents.past]) {
    if (item.event.ownerGroupId) groupByEvent.set(item.event.id, item.event.ownerGroupId);
  }
  for (const payment of payments) {
    const groupId = payment.eventId ? groupByEvent.get(payment.eventId) : null;
    if (!groupId) continue;
    const amount = formatMoney(payment.amount, payment.currency, locale);
    if (payment.status === "overdue" || payment.status === "pending") {
      pushNotice(groupId, {
        id: `payment-${payment.id}`,
        kind: payment.status === "overdue" ? "payment_overdue" : "payment_due",
        title: payment.status === "overdue" ? `${amount} overdue` : `${amount} to pay`,
        detail: getPaymentTitle(payment.type, payment.periodLabel),
        href: "/portal/payments",
        urgent: payment.status === "overdue" ? "error" : null,
      });
    } else if (payment.status === "refund_due") {
      pushNotice(groupId, {
        id: `refund-${payment.id}`,
        kind: "refund_due",
        title: `${amount} coming back to you`,
        detail: getPaymentTitle(payment.type, payment.periodLabel),
        href: "/portal/payments",
        urgent: null,
      });
    }
  }

  for (const item of [...viewerEvents.invited, ...viewerEvents.open]) {
    const { event, response } = item;
    if (!event.ownerGroupId) continue;
    if (!response && event.visibility === "targeted" && isRsvpOpen(event, now).open) {
      pushNotice(event.ownerGroupId, {
        id: `rsvp-${event.id}`,
        kind: "rsvp_needed",
        title: `Are you coming to ${event.title}?`,
        detail: event.rsvpDeadlineAt
          ? `Answer by ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(event.rsvpDeadlineAt)}.`
          : "You have not answered yet.",
        href: `/portal/events/${event.slug}`,
        urgent: "warning",
      });
    }
    if (!event.startsAt || event.startsAt < now) continue;
    const current = nextEventByGroup.get(event.ownerGroupId);
    if (!current || event.startsAt < current.startsAt) {
      nextEventByGroup.set(event.ownerGroupId, {
        id: event.id,
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
      });
    }
  }

  const categories: PortalGroupCategory[] = categoryRows
    .map((category) => {
      const inCategory = groupRows.filter((group) => group.categoryId === category.id);
      const mine: PortalGroup[] = inCategory
        .filter((group) => myRole.has(group.id))
        .map((group) => ({
          id: group.id,
          name: group.name,
          description: group.description,
          joinPolicy: group.joinPolicy,
          role: myRole.get(group.id) ?? "member",
          leaders: leadersByGroup.get(group.id) ?? [],
          nextEvent: nextEventByGroup.get(group.id) ?? null,
          notices: noticesByGroup.get(group.id) ?? [],
        }));
      return {
        id: category.id,
        name: category.name,
        description: category.description,
        selectionMode: category.selectionMode,
        mine,
        hasGroups: inCategory.length > 0,
      };
    })
    // A category with no groups at all has nothing to say to a member.
    .filter((category) => category.hasGroups);

  return { categories };
}
