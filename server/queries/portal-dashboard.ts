import { and, eq, sql } from "drizzle-orm";

import { isRsvpOpen } from "@/lib/events/rsvp";
import { orgFormatLocale } from "@/lib/i18n";
import { formatMoney, getPaymentTitle } from "@/lib/payments";
import {
  PORTAL_AREA_ORDER,
  profileCompleteness,
  rankTodos,
  sortByDate,
  type MembershipSummary,
  type PortalArea,
  type PortalDashboardData,
  type PortalTile,
  type PortalTodo,
  type PortalUpcoming,
} from "@/lib/portal-dashboard";
import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  type Organization,
  type TenantMember,
} from "@/server/db/schema";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import { listEventsForViewer } from "@/server/queries/events";
import { listFormsForViewer } from "@/server/queries/forms";
import {
  getMemberCustomFieldAnswerMap,
  listActiveMemberCustomFields,
} from "@/server/queries/member-custom-fields";
import { listPaymentsForMember } from "@/server/queries/payments";
import { activeMembership } from "@/server/lib/group-membership";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A member's horizon is longer than an admin's: trips are planned weeks out. */
const AHEAD_DAYS = 30;

const AREA_LINKS: Record<PortalArea, { title: string; href: string }> = {
  profile: { title: "Profile", href: "/portal/profile" },
  groups: { title: "My groups", href: "/portal/groups" },
  events: { title: "Events", href: "/portal/events" },
  forms: { title: "Forms", href: "/portal/forms" },
  payments: { title: "Payments", href: "/portal/payments" },
};

async function countPendingJoinRequests(orgId: string, memberId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.memberId, memberId),
        eq(groupMemberships.status, "pending"),
      ),
    );

  return row?.count ?? 0;
}

async function listMemberGroups(orgId: string, memberId: string) {
  const rows = await db
    .select({
      id: groups.id,
      slug: groups.slug,
      name: groups.name,
      categoryName: groupCategories.name,
      role: groupMemberships.role,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        activeMembership(),
        eq(groupMemberships.memberId, memberId),
        eq(groups.isActive, true),
        eq(groupCategories.isActive, true),
      ),
    )
    .orderBy(groupCategories.name, groups.name);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    categoryName: row.categoryName,
    isAdmin: row.role === "group_admin",
  }));
}

/**
 * Everything the member's overview shows.
 *
 * Built on the same viewer queries the Events, Forms and Payments pages use,
 * so a row here and a row there are the same row — the dashboard adds nothing
 * the member could not find by clicking through, it only puts it first.
 */
export async function getPortalDashboardData(params: {
  organization: Organization;
  member: TenantMember;
}): Promise<PortalDashboardData> {
  const { organization, member } = params;
  const orgId = organization.id;
  const now = new Date();
  const ahead = new Date(now.getTime() + AHEAD_DAYS * DAY_MS);
  const locale = orgFormatLocale(organization.locale);

  const [payments, forms, events, memberGroups, pendingRequests, fields, answers] = await Promise.all([
    listPaymentsForMember(orgId, member.id),
    listFormsForViewer({ orgId, memberId: member.id }),
    listEventsForViewer({ orgId, memberId: member.id }),
    listMemberGroups(orgId, member.id),
    countPendingJoinRequests(orgId, member.id),
    listActiveMemberCustomFields(orgId, ["registration", "post_approval", "optional"]),
    getMemberCustomFieldAnswerMap(orgId, member.id),
  ]);

  const completeness = profileCompleteness(fields, answers);
  const todos: PortalTodo[] = [];
  const upcoming: PortalUpcoming[] = [];

  // ── Profile ──
  if (completeness.missingRequired.length > 0) {
    todos.push({
      id: "profile-required",
      area: "profile",
      kind: "profile_required",
      title: "Finish your profile",
      detail: `${organization.name} still needs: ${completeness.missingRequired.map((f) => f.label).join(", ")}.`,
      href: "/portal/profile",
      dueAt: null,
      urgent: "warning",
    });
  } else if (completeness.missingOptional.length > 0) {
    const n = completeness.missingOptional.length;
    todos.push({
      id: "profile-optional",
      area: "profile",
      kind: "profile_optional",
      title: `${n} optional ${n === 1 ? "detail" : "details"} you could add`,
      detail: completeness.missingOptional.map((f) => f.label).join(", "),
      href: "/portal/profile",
      dueAt: null,
    });
  }

  // ── Payments ──
  for (const payment of payments) {
    if (payment.status !== "pending" && payment.status !== "overdue") continue;
    const amount = formatMoney(payment.amount, payment.currency, locale);
    const title = getPaymentTitle(payment.type, payment.periodLabel);
    todos.push({
      id: `payment-${payment.id}`,
      area: "payments",
      kind: payment.status === "overdue" ? "payment_overdue" : "payment_due",
      title: payment.status === "overdue" ? `${amount} overdue` : `${amount} to pay`,
      detail: title,
      href: "/portal/payments",
      dueAt: payment.dueAt,
      urgent: payment.status === "overdue" ? "error" : null,
    });
    if (payment.status === "pending" && payment.dueAt >= now && payment.dueAt <= ahead) {
      upcoming.push({
        id: `payment-due-${payment.id}`,
        area: "payments",
        kind: "payment_due",
        at: payment.dueAt,
        title: `${amount} due`,
        detail: title,
        href: "/portal/payments",
      });
    }
  }
  const refunds = payments.filter((p) => p.status === "refund_due");
  if (refunds.length > 0) {
    const total = refunds.reduce((acc, p) => acc + p.amount, 0);
    todos.push({
      id: "refund-due",
      area: "payments",
      kind: "refund_due",
      title: `${formatMoney(total, refunds[0].currency, locale)} coming back to you`,
      detail: "A refund is being arranged — nothing to do, but worth knowing.",
      href: "/portal/payments",
      dueAt: null,
    });
  }

  // ── Events ──
  for (const item of [...events.invited, ...events.open]) {
    const { event, response } = item;
    const href = `/portal/events/${event.slug}`;
    const rsvp = isRsvpOpen(event, now);

    if (!response && rsvp.open && event.visibility === "targeted") {
      todos.push({
        id: `rsvp-${event.id}`,
        area: "events",
        kind: "rsvp_needed",
        title: `Are you coming to ${event.title}?`,
        detail: event.rsvpDeadlineAt
          ? `Answer by ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(event.rsvpDeadlineAt)}.`
          : "You have been invited and have not answered yet.",
        href,
        dueAt: event.rsvpDeadlineAt ?? event.startsAt,
      });
    }

    if (event.startsAt && event.startsAt >= now && event.startsAt <= ahead) {
      const detailParts: string[] = [];
      if (event.locationName) detailParts.push(event.locationName);
      if (response?.answer === "yes") {
        detailParts.push(response.standing === "reserve" ? "on the reserve list" : "you are going");
      } else if (response?.answer === "maybe") {
        detailParts.push("you said maybe");
      } else if (!response) {
        detailParts.push("no answer yet");
      }
      upcoming.push({
        id: `event-${event.id}`,
        area: "events",
        kind: "event",
        at: event.startsAt,
        title: event.title,
        detail: detailParts.join(" · "),
        href,
        answer: response?.answer ?? null,
      });
    }

    if (
      !response &&
      rsvp.open &&
      event.rsvpDeadlineAt &&
      event.rsvpDeadlineAt >= now &&
      event.rsvpDeadlineAt <= ahead
    ) {
      upcoming.push({
        id: `rsvp-deadline-${event.id}`,
        area: "events",
        kind: "rsvp_deadline",
        at: event.rsvpDeadlineAt,
        title: `Last day to answer for ${event.title}`,
        detail: "After this the organizers close the list.",
        href,
      });
    }
  }

  // ── Forms ──
  for (const item of forms.pending) {
    const href = `/portal/forms/${item.form.id}`;
    todos.push({
      id: `form-${item.form.id}`,
      area: "forms",
      kind: "form_pending",
      title: item.form.title,
      detail: item.event
        ? `${item.form.required ? "Required" : "Requested"} for ${item.event.title}.`
        : item.form.required
          ? "Required by the organization."
          : "The organization would like your answer.",
      href,
      dueAt: item.form.closesAt,
      urgent: item.form.required ? "warning" : null,
    });
    if (item.form.closesAt && item.form.closesAt >= now && item.form.closesAt <= ahead) {
      upcoming.push({
        id: `form-closes-${item.form.id}`,
        area: "forms",
        kind: "form_closes",
        at: item.form.closesAt,
        title: `${item.form.title} closes`,
        detail: "No more answers after this.",
        href,
      });
    }
  }

  // ── Membership ──
  const latestFee = payments
    .filter((p) => p.type === "membership_fee" && p.status !== "cancelled")
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey))[0];
  const membership: MembershipSummary = {
    status: member.status,
    role: member.role,
    memberSince: member.linkedAt ?? member.createdAt,
    contactEmail: resolveMemberEmailForOrg({ member, organization }),
    groups: memberGroups,
    pendingRequests,
    fee: organization.membershipFeeEnabled
      ? latestFee
        ? {
            label: latestFee.periodLabel,
            status:
              latestFee.status === "paid"
                ? "paid"
                : latestFee.status === "overdue"
                  ? "overdue"
                  : "pending",
          }
        : { label: "", status: "none" }
      : null,
  };

  const ranked = rankTodos(todos);
  const upcomingEvents = events.invited.length + events.open.length;
  const pendingMoney = payments
    .filter((p) => p.status === "pending" || p.status === "overdue")
    .reduce((acc, p) => acc + p.amount, 0);
  const currency = payments[0]?.currency ?? organization.membershipFeeCurrency ?? "CZK";

  const stats: Record<PortalArea, PortalTile["stat"]> = {
    profile: {
      value: `${completeness.percent}%`,
      label:
        completeness.total === 0
          ? "nothing to fill in"
          : `${completeness.filled} of ${completeness.total} details filled`,
    },
    groups: {
      value: String(memberGroups.length),
      label: memberGroups.length === 1 ? "group" : "groups",
    },
    events: { value: String(upcomingEvents), label: "you can attend" },
    forms: { value: String(forms.pending.length), label: "waiting for your answer" },
    payments:
      pendingMoney > 0
        ? { value: formatMoney(pendingMoney, currency, locale), label: "to pay" }
        : { value: "0", label: "nothing to pay" },
  };

  const tiles: PortalTile[] = PORTAL_AREA_ORDER.map((key) => ({
    key,
    ...AREA_LINKS[key],
    stat: stats[key],
    alerts: ranked.filter((t) => t.area === key && t.kind !== "profile_optional" && t.kind !== "refund_due").length,
  }));

  return { now, todos: ranked, upcoming: sortByDate(upcoming), membership, completeness, tiles };
}
