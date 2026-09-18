import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { isRsvpOpen } from "@/lib/events/rsvp";
import { orgFormatLocale } from "@/lib/i18n";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { formatMoney, getPaymentTitle } from "@/lib/payments";
import { db } from "@/server/db";
import { groupMemberships, tenantMembers, type Organization } from "@/server/db/schema";
import { activeMembership } from "@/server/lib/group-membership";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import type { listEventsForViewer } from "@/server/queries/events";
import type { MemberPaymentRow } from "@/server/queries/payments";

/**
 * The per-group summaries the portal shows in more than one place: the group
 * card on `/portal/groups` and the group's own page. They live here so both
 * compute leaders, notices and "next event" the same way — a member must never
 * see a different set of leaders on the card than on the page behind it.
 */

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

export type PortalGroupNextEvent = {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
};

type ViewerEvents = Awaited<ReturnType<typeof listEventsForViewer>>;

/**
 * Group admins — the people a member is meant to write to — for every group
 * in `groupIds`, ordered by name. Only active-status members are listed: a
 * suspended leader is not someone to write to.
 */
export async function loadLeadersByGroup(params: {
  organization: Organization;
  groupIds: readonly string[];
  viewerMemberId: string;
}): Promise<Map<string, PortalGroupPerson[]>> {
  const { organization, groupIds, viewerMemberId } = params;
  const leadersByGroup = new Map<string, PortalGroupPerson[]>();
  if (groupIds.length === 0) return leadersByGroup;

  const rows = await db
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
        eq(groupMemberships.orgId, organization.id),
        activeMembership(),
        inArray(groupMemberships.groupId, [...groupIds]),
        eq(groupMemberships.role, "group_admin"),
        eq(tenantMembers.status, "active"),
      ),
    )
    .orderBy(asc(tenantMembers.lastName), asc(tenantMembers.firstName));

  for (const row of rows) {
    const person: PortalGroupPerson = {
      id: row.memberId,
      name: getMemberDisplayName(row) || "Unnamed member",
      email: resolveMemberEmailForOrg({ member: row, organization }),
      isYou: row.memberId === viewerMemberId,
    };
    leadersByGroup.set(row.groupId, [...(leadersByGroup.get(row.groupId) ?? []), person]);
  }

  return leadersByGroup;
}

/**
 * Active admins per group. Counts every active admin, not only the
 * active-status people `loadLeadersByGroup` lists, so "you are the last
 * leader" is judged on the roster as the admin sees it.
 */
export async function loadAdminCountByGroup(
  orgId: string,
  groupIds: readonly string[],
): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();

  const rows = await db
    .select({
      groupId: groupMemberships.groupId,
      count: sql<number>`count(*)::int`,
    })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        activeMembership(),
        inArray(groupMemberships.groupId, [...groupIds]),
        eq(groupMemberships.role, "group_admin"),
      ),
    )
    .groupBy(groupMemberships.groupId);

  return new Map(rows.map((row) => [row.groupId, row.count]));
}

/**
 * What in each group is waiting on the member, plus the group's next dated
 * event. Pure over the viewer-scoped events and payments the caller already
 * fetched, so it adds no queries.
 */
export function buildGroupNotices(params: {
  organization: Organization;
  viewerEvents: ViewerEvents;
  payments: readonly MemberPaymentRow[];
  now: Date;
}): {
  noticesByGroup: Map<string, PortalGroupNotice[]>;
  nextEventByGroup: Map<string, PortalGroupNextEvent>;
} {
  const { organization, viewerEvents, payments, now } = params;
  const locale = orgFormatLocale(organization.locale);
  const nextEventByGroup = new Map<string, PortalGroupNextEvent>();
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

  return { noticesByGroup, nextEventByGroup };
}
