import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, sum } from "drizzle-orm";

import {
  MODULE_ORDER,
  joinRequestAttention,
  nextRenewalDate,
  pluralize,
  rankAttention,
  sortActivity,
  sortUpcoming,
  type ActivityItem,
  type AdminDashboardData,
  type AttentionItem,
  type DashboardModule,
  type ModuleTile,
  type UpcomingItem,
} from "@/lib/dashboard";
import { formatMoney } from "@/lib/payments";
import { orgFormatLocale } from "@/lib/i18n";
import { db } from "@/server/db";
import {
  emailActivities,
  eventResponses,
  events,
  formSubmissions,
  forms,
  groupCategories,
  groupMemberships,
  groups,
  memberAuthEvents,
  memberInvites,
  memberPayments,
  membershipReportGroups,
  membershipReports,
  tenantMembers,
  workspaceGroupDrift,
  workspaceSyncOperations,
} from "@/server/db/schema";
import {
  listManageableOwners,
  listScopedGroupIds,
  requireAdminAccess,
} from "@/server/queries/access";
import { listMemberIdsInGroups } from "@/server/queries/payments";

type AdminContext = Awaited<ReturnType<typeof requireAdminAccess>>;

const DAY_MS = 24 * 60 * 60 * 1000;
/** "About to happen" reaches this far ahead. */
const AHEAD_DAYS = 14;
/** "Just happened" reaches this far back. */
const BEHIND_DAYS = 7;
/** Fee renewal is announced this far ahead — it takes longer to prepare for. */
const RENEWAL_NOTICE_DAYS = 30;

const countInt = sql<number>`cast(count(*) as int)`;

function memberName(row: { firstName: string; lastName: string; email: string | null }) {
  const name = `${row.firstName} ${row.lastName}`.trim();
  return name.length > 0 ? name : (row.email ?? "Unnamed member");
}

type Signals = {
  attention: AttentionItem[];
  upcoming: UpcomingItem[];
  activity: ActivityItem[];
  /** Per-module headline stat, filled by whichever section owns the module. */
  stats: Partial<Record<DashboardModule, ModuleTile["stat"]>>;
};

function emptySignals(): Signals {
  return { attention: [], upcoming: [], activity: [], stats: {} };
}

type Window = { now: Date; ahead: Date; behind: Date };

// ─── Members ────────────────────────────────────────────────────────────────

async function memberSignals(orgId: string, w: Window): Promise<Signals> {
  const s = emptySignals();
  const liveMember = and(eq(tenantMembers.orgId, orgId), isNull(tenantMembers.deletedAt));

  const [statusRows, [pendingOldest], invitesInTrouble, recentRequests, recentActivations, purges] =
    await Promise.all([
      db
        .select({ status: tenantMembers.status, count: countInt })
        .from(tenantMembers)
        .where(liveMember)
        .groupBy(tenantMembers.status),
      db
        .select({ oldest: sql<Date | null>`min(${tenantMembers.createdAt})` })
        .from(tenantMembers)
        .where(and(liveMember, eq(tenantMembers.status, "pending"))),
      db
        .select({ count: countInt, oldest: sql<Date | null>`min(${memberInvites.createdAt})` })
        .from(memberInvites)
        .innerJoin(tenantMembers, eq(tenantMembers.id, memberInvites.memberId))
        .where(
          and(
            eq(memberInvites.orgId, orgId),
            eq(tenantMembers.status, "invited"),
            isNull(tenantMembers.deletedAt),
            or(
              inArray(memberInvites.deliveryStatus, ["bounced", "complained", "failed"]),
              inArray(memberInvites.status, ["failed", "expired"]),
            ),
          ),
        ),
      db
        .select({
          id: tenantMembers.id,
          firstName: tenantMembers.firstName,
          lastName: tenantMembers.lastName,
          email: tenantMembers.email,
          createdAt: tenantMembers.createdAt,
        })
        .from(tenantMembers)
        .where(
          and(
            liveMember,
            eq(tenantMembers.status, "pending"),
            gte(tenantMembers.createdAt, w.behind),
          ),
        )
        .orderBy(desc(tenantMembers.createdAt))
        .limit(5),
      db
        .select({
          id: memberAuthEvents.id,
          memberId: tenantMembers.id,
          firstName: tenantMembers.firstName,
          lastName: tenantMembers.lastName,
          email: tenantMembers.email,
          at: memberAuthEvents.createdAt,
        })
        .from(memberAuthEvents)
        .innerJoin(tenantMembers, eq(tenantMembers.id, memberAuthEvents.memberId))
        .where(
          and(
            eq(memberAuthEvents.orgId, orgId),
            eq(memberAuthEvents.eventType, "invite_completed"),
            gte(memberAuthEvents.createdAt, w.behind),
          ),
        )
        .orderBy(desc(memberAuthEvents.createdAt))
        .limit(5),
      db
        .select({ count: countInt, next: sql<Date | null>`min(${tenantMembers.purgeAfter})` })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.orgId, orgId),
            eq(tenantMembers.status, "deleted"),
            lte(tenantMembers.purgeAfter, w.ahead),
          ),
        ),
    ]);

  const byStatus = new Map(statusRows.map((row) => [row.status, row.count]));
  const pending = byStatus.get("pending") ?? 0;
  const active = byStatus.get("active") ?? 0;
  s.stats.members = { value: String(active), label: "active members" };

  if (pending > 0) {
    s.attention.push({
      id: "members-pending",
      urgent: true,
      module: "members",
      tone: "warning",
      count: pending,
      title: pluralize(pending, "join request", "join requests") + " to review",
      detail: "People waiting for you to approve or reject them.",
      href: "/admin/members?status=pending",
      waitingSince: pendingOldest?.oldest ? new Date(pendingOldest.oldest) : null,
    });
  }

  const [trouble] = invitesInTrouble;
  if (trouble && trouble.count > 0) {
    s.attention.push({
      id: "members-invites",
      module: "members",
      tone: "danger",
      count: trouble.count,
      title: pluralize(trouble.count, "invite") + " never reached the member",
      detail: "Bounced, failed or expired — those people cannot sign in.",
      href: "/admin/members?status=invited",
      waitingSince: trouble.oldest ? new Date(trouble.oldest) : null,
    });
  }

  for (const row of recentRequests) {
    s.activity.push({
      id: `join-${row.id}`,
      module: "members",
      kind: "join_request",
      at: row.createdAt,
      title: `${memberName(row)} asked to join`,
      detail: "Awaiting your decision.",
      href: `/admin/members/${row.id}`,
    });
  }

  for (const row of recentActivations) {
    s.activity.push({
      id: `activated-${row.id}`,
      module: "members",
      kind: "member_activated",
      at: row.at,
      title: `${memberName(row)} activated their account`,
      detail: "Invite completed.",
      href: `/admin/members/${row.memberId}`,
    });
  }

  const [purge] = purges;
  if (purge && purge.count > 0 && purge.next) {
    s.upcoming.push({
      id: "members-purge",
      module: "members",
      kind: "member_purge",
      at: new Date(purge.next),
      title: pluralize(purge.count, "deleted member", "deleted members") + " will be purged",
      detail: "Their records are erased for good once the retention window ends.",
      href: "/admin/members?status=deleted",
    });
  }

  return s;
}

// ─── Payments ───────────────────────────────────────────────────────────────

async function paymentSignals(
  orgId: string,
  w: Window,
  locale: string,
  memberIds: string[] | null,
): Promise<Signals> {
  const s = emptySignals();
  if (memberIds && memberIds.length === 0) return s;

  const scope = and(
    eq(memberPayments.orgId, orgId),
    memberIds ? inArray(memberPayments.memberId, memberIds) : undefined,
  );

  const [statusRows, [overdueOldest], dueSoon, [confirmed]] = await Promise.all([
    db
      .select({
        status: memberPayments.status,
        count: countInt,
        total: sum(memberPayments.amount),
        currency: memberPayments.currency,
      })
      .from(memberPayments)
      .where(and(scope, inArray(memberPayments.status, ["overdue", "refund_due", "pending"])))
      .groupBy(memberPayments.status, memberPayments.currency),
    db
      .select({ oldest: sql<Date | null>`min(${memberPayments.dueAt})` })
      .from(memberPayments)
      .where(and(scope, eq(memberPayments.status, "overdue"))),
    db
      .select({
        day: sql<string>`date_trunc('day', ${memberPayments.dueAt})`,
        count: countInt,
        total: sum(memberPayments.amount),
        currency: memberPayments.currency,
      })
      .from(memberPayments)
      .where(
        and(
          scope,
          eq(memberPayments.status, "pending"),
          gte(memberPayments.dueAt, w.now),
          lte(memberPayments.dueAt, w.ahead),
        ),
      )
      .groupBy(sql`date_trunc('day', ${memberPayments.dueAt})`, memberPayments.currency)
      .orderBy(sql`date_trunc('day', ${memberPayments.dueAt})`)
      .limit(6),
    db
      .select({
        count: countInt,
        total: sum(memberPayments.amount),
        currency: sql<string | null>`min(${memberPayments.currency})`,
        latest: sql<Date | null>`max(${memberPayments.paidAt})`,
      })
      .from(memberPayments)
      .where(and(scope, eq(memberPayments.status, "paid"), gte(memberPayments.paidAt, w.behind))),
  ]);

  const bucket = (status: "overdue" | "refund_due" | "pending") => {
    const rows = statusRows.filter((row) => row.status === status);
    const total = rows.reduce((acc, row) => acc + Number(row.total ?? 0), 0);
    const total_count = rows.reduce((acc, row) => acc + row.count, 0);
    return { count: total_count, totalCents: total, currency: rows[0]?.currency ?? "CZK" };
  };

  const overdue = bucket("overdue");
  const refund = bucket("refund_due");
  const pending = bucket("pending");

  s.stats.payments =
    overdue.count > 0
      ? { value: formatMoney(overdue.totalCents, overdue.currency, locale), label: "overdue" }
      : { value: formatMoney(pending.totalCents, pending.currency, locale), label: "awaiting payment" };

  if (overdue.count > 0) {
    s.attention.push({
      id: "payments-overdue",
      urgent: true,
      module: "payments",
      tone: "danger",
      count: overdue.count,
      title: pluralize(overdue.count, "payment") + " overdue",
      detail: `${formatMoney(overdue.totalCents, overdue.currency, locale)} past its due date.`,
      href: "/admin/payments",
      waitingSince: overdueOldest?.oldest ? new Date(overdueOldest.oldest) : null,
    });
  }

  if (refund.count > 0) {
    s.attention.push({
      id: "payments-refund",
      urgent: true,
      module: "payments",
      tone: "warning",
      count: refund.count,
      title: pluralize(refund.count, "refund") + " to settle",
      detail: `${formatMoney(refund.totalCents, refund.currency, locale)} paid for seats that are no longer held.`,
      href: "/admin/payments",
      waitingSince: null,
    });
  }

  for (const row of dueSoon) {
    const at = new Date(row.day);
    s.upcoming.push({
      id: `payments-due-${at.toISOString()}-${row.currency}`,
      module: "payments",
      kind: "payment_due",
      at,
      title: pluralize(row.count, "payment") + " due",
      detail: `${formatMoney(Number(row.total ?? 0), row.currency, locale)} becomes overdue after this day.`,
      href: "/admin/payments",
    });
  }

  if (confirmed && confirmed.count > 0 && confirmed.latest) {
    s.activity.push({
      id: "payments-confirmed",
      module: "payments",
      kind: "payments_confirmed",
      at: new Date(confirmed.latest),
      title: pluralize(confirmed.count, "payment") + " confirmed",
      detail: `${formatMoney(Number(confirmed.total ?? 0), confirmed.currency ?? "CZK", locale)} received in the last ${BEHIND_DAYS} days.`,
      href: "/admin/payments",
    });
  }

  return s;
}

// ─── Events & forms ─────────────────────────────────────────────────────────

type Owners = Awaited<ReturnType<typeof listManageableOwners>>;

function ownerClauses(
  table: typeof events | typeof forms,
  owners: Owners,
) {
  const clauses = [
    owners.organization ? eq(table.ownerType, "organization") : null,
    owners.categoryIds.length > 0 ? inArray(table.ownerCategoryId, owners.categoryIds) : null,
    owners.groupIds.length > 0 ? inArray(table.ownerGroupId, owners.groupIds) : null,
  ].filter((clause): clause is NonNullable<typeof clause> => clause != null);
  return clauses.length > 0 ? or(...clauses) : null;
}

async function eventSignals(orgId: string, w: Window, owners: Owners): Promise<Signals> {
  const s = emptySignals();
  const owned = ownerClauses(events, owners);
  if (!owned) return s;

  const live = and(eq(events.orgId, orgId), isNull(events.deletedAt), owned);
  const eventEnd = sql`coalesce(${events.endsAt}, ${events.startsAt})`;

  const [upcomingRows, deadlineRows, draftRows, endedRows, rsvpRows] = await Promise.all([
    db
      .select({ id: events.id, title: events.title, startsAt: events.startsAt, capacity: events.capacity })
      .from(events)
      .where(
        and(
          live,
          eq(events.status, "published"),
          gte(events.startsAt, w.now),
          lte(events.startsAt, w.ahead),
        ),
      )
      .orderBy(asc(events.startsAt))
      .limit(8),
    db
      .select({ id: events.id, title: events.title, rsvpDeadlineAt: events.rsvpDeadlineAt })
      .from(events)
      .where(
        and(
          live,
          eq(events.status, "published"),
          gte(events.rsvpDeadlineAt, w.now),
          lte(events.rsvpDeadlineAt, w.ahead),
        ),
      )
      .orderBy(asc(events.rsvpDeadlineAt))
      .limit(8),
    db
      .select({
        count: countInt,
        soon: sql<number>`cast(count(*) filter (where ${events.startsAt} <= ${w.ahead}) as int)`,
        oldest: sql<Date | null>`min(${events.createdAt})`,
      })
      .from(events)
      .where(and(live, eq(events.status, "draft"))),
    db
      .select({ id: events.id, title: events.title, endedAt: sql<Date>`${eventEnd}` })
      .from(events)
      .where(
        and(
          live,
          eq(events.status, "published"),
          gte(eventEnd, w.behind),
          lte(eventEnd, w.now),
        ),
      )
      .orderBy(desc(eventEnd))
      .limit(5),
    db
      .select({
        eventId: eventResponses.eventId,
        title: events.title,
        count: countInt,
        latest: sql<Date>`max(${eventResponses.respondedAt})`,
      })
      .from(eventResponses)
      .innerJoin(events, eq(events.id, eventResponses.eventId))
      .where(and(live, gte(eventResponses.respondedAt, w.behind)))
      .groupBy(eventResponses.eventId, events.title)
      .orderBy(desc(sql`max(${eventResponses.respondedAt})`))
      .limit(5),
  ]);

  const countedIds = [...upcomingRows.map((r) => r.id), ...endedRows.map((r) => r.id)];
  const seatRows =
    countedIds.length > 0
      ? await db
          .select({
            eventId: eventResponses.eventId,
            standing: eventResponses.standing,
            seats: sql<number>`cast(sum(1 + ${eventResponses.guestCount}) as int)`,
          })
          .from(eventResponses)
          .where(
            and(
              eq(eventResponses.orgId, orgId),
              inArray(eventResponses.eventId, countedIds),
              eq(eventResponses.answer, "yes"),
            ),
          )
          .groupBy(eventResponses.eventId, eventResponses.standing)
      : [];
  const seats = new Map<string, { confirmed: number; reserve: number }>();
  for (const row of seatRows) {
    const entry = seats.get(row.eventId) ?? { confirmed: 0, reserve: 0 };
    entry[row.standing] += row.seats;
    seats.set(row.eventId, entry);
  }

  s.stats.events = { value: String(upcomingRows.length), label: `in the next ${AHEAD_DAYS} days` };

  for (const row of upcomingRows) {
    if (!row.startsAt) continue;
    const seat = seats.get(row.id) ?? { confirmed: 0, reserve: 0 };
    const parts = [
      row.capacity != null ? `${seat.confirmed} / ${row.capacity} going` : `${seat.confirmed} going`,
    ];
    if (seat.reserve > 0) parts.push(`${seat.reserve} on the reserve list`);
    s.upcoming.push({
      id: `event-${row.id}`,
      module: "events",
      kind: "event",
      at: row.startsAt,
      title: row.title,
      detail: parts.join(" · "),
      href: `/admin/events/${row.id}`,
    });
  }

  for (const row of deadlineRows) {
    if (!row.rsvpDeadlineAt) continue;
    s.upcoming.push({
      id: `rsvp-${row.id}`,
      module: "events",
      kind: "rsvp_deadline",
      at: row.rsvpDeadlineAt,
      title: `RSVPs close for ${row.title}`,
      detail: "Last chance to nudge anyone who has not answered.",
      href: `/admin/events/${row.id}`,
    });
  }

  const [drafts] = draftRows;
  if (drafts && drafts.count > 0) {
    s.attention.push({
      id: "events-drafts",
      module: "events",
      tone: drafts.soon > 0 ? "warning" : "info",
      count: drafts.count,
      title: pluralize(drafts.count, "draft event", "draft events") + " not yet published",
      detail:
        drafts.soon > 0
          ? pluralize(drafts.soon, "of them starts", "of them start") +
            ` within ${AHEAD_DAYS} days and nobody can see ` +
            (drafts.soon === 1 ? "it." : "them.")
          : "Members cannot see or respond to a draft.",
      href: "/admin/events",
      waitingSince: drafts.oldest ? new Date(drafts.oldest) : null,
    });
  }

  for (const row of endedRows) {
    const seat = seats.get(row.id) ?? { confirmed: 0, reserve: 0 };
    s.activity.push({
      id: `ended-${row.id}`,
      module: "events",
      kind: "event_happened",
      at: new Date(row.endedAt),
      title: `${row.title} took place`,
      detail: `${seat.confirmed} confirmed going.`,
      href: `/admin/events/${row.id}`,
    });
  }

  for (const row of rsvpRows) {
    s.activity.push({
      id: `rsvps-${row.eventId}`,
      module: "events",
      kind: "rsvp",
      at: new Date(row.latest),
      title: pluralize(row.count, "new RSVP", "new RSVPs") + ` for ${row.title}`,
      detail: `In the last ${BEHIND_DAYS} days.`,
      href: `/admin/events/${row.eventId}`,
    });
  }

  return s;
}

async function formSignals(orgId: string, w: Window, owners: Owners): Promise<Signals> {
  const s = emptySignals();
  const owned = ownerClauses(forms, owners);
  if (!owned) return s;

  const live = and(
    eq(forms.orgId, orgId),
    isNull(forms.deletedAt),
    eq(forms.isTemplate, false),
    owned,
  );

  const [statusRows, closingRows, submissionRows] = await Promise.all([
    db
      .select({ status: forms.status, count: countInt })
      .from(forms)
      .where(live)
      .groupBy(forms.status),
    db
      .select({ id: forms.id, title: forms.title, closesAt: forms.closesAt })
      .from(forms)
      .where(
        and(live, eq(forms.status, "open"), gte(forms.closesAt, w.now), lte(forms.closesAt, w.ahead)),
      )
      .orderBy(asc(forms.closesAt))
      .limit(6),
    db
      .select({
        formId: formSubmissions.formId,
        title: forms.title,
        count: countInt,
        latest: sql<Date>`max(${formSubmissions.submittedAt})`,
      })
      .from(formSubmissions)
      .innerJoin(forms, eq(forms.id, formSubmissions.formId))
      .where(
        and(live, isNull(formSubmissions.shreddedAt), gte(formSubmissions.submittedAt, w.behind)),
      )
      .groupBy(formSubmissions.formId, forms.title)
      .orderBy(desc(sql`max(${formSubmissions.submittedAt})`))
      .limit(5),
  ]);

  const open = statusRows.find((row) => row.status === "open")?.count ?? 0;
  s.stats.forms = { value: String(open), label: "open right now" };

  for (const row of closingRows) {
    if (!row.closesAt) continue;
    s.upcoming.push({
      id: `form-${row.id}`,
      module: "forms",
      kind: "form_closes",
      at: row.closesAt,
      title: `${row.title} closes`,
      detail: "No more answers after this.",
      href: `/admin/forms/${row.id}`,
    });
  }

  for (const row of submissionRows) {
    s.activity.push({
      id: `submissions-${row.formId}`,
      module: "forms",
      kind: "form_submissions",
      at: new Date(row.latest),
      title: pluralize(row.count, "new answer", "new answers") + ` to ${row.title}`,
      detail: `In the last ${BEHIND_DAYS} days.`,
      href: `/admin/forms/${row.formId}`,
    });
  }

  return s;
}

// ─── Reports ────────────────────────────────────────────────────────────────

async function reportSignals(orgId: string, w: Window): Promise<Signals> {
  const s = emptySignals();

  const [report] = await db
    .select({
      id: membershipReports.id,
      periodLabel: membershipReports.periodLabel,
      confirmDueAt: membershipReports.confirmDueAt,
      openedAt: membershipReports.openedAt,
    })
    .from(membershipReports)
    .where(and(eq(membershipReports.orgId, orgId), eq(membershipReports.status, "open")))
    .orderBy(desc(membershipReports.openedAt))
    .limit(1);

  if (!report) {
    s.stats.reports = { value: "—", label: "no report open" };
    return s;
  }

  const [statusRows, recentSubmissions] = await Promise.all([
    db
      .select({
        status: membershipReportGroups.status,
        count: countInt,
        oldest: sql<Date | null>`min(${membershipReportGroups.submittedAt})`,
      })
      .from(membershipReportGroups)
      .where(
        and(eq(membershipReportGroups.orgId, orgId), eq(membershipReportGroups.reportId, report.id)),
      )
      .groupBy(membershipReportGroups.status),
    db
      .select({
        id: membershipReportGroups.id,
        groupName: membershipReportGroups.groupName,
        submittedAt: membershipReportGroups.submittedAt,
        memberCount: membershipReportGroups.memberCount,
      })
      .from(membershipReportGroups)
      .where(
        and(
          eq(membershipReportGroups.orgId, orgId),
          eq(membershipReportGroups.reportId, report.id),
          eq(membershipReportGroups.status, "submitted"),
          gte(membershipReportGroups.submittedAt, w.behind),
        ),
      )
      .orderBy(desc(membershipReportGroups.submittedAt))
      .limit(5),
  ]);

  const byStatus = new Map(statusRows.map((row) => [row.status, row]));
  const total = statusRows.reduce((acc, row) => acc + row.count, 0);
  const approved = byStatus.get("approved")?.count ?? 0;
  const submitted = byStatus.get("submitted");
  const waiting = (byStatus.get("not_started")?.count ?? 0) + (byStatus.get("in_progress")?.count ?? 0);
  const href = `/admin/reports?report=${report.id}`;

  s.stats.reports = { value: `${approved} / ${total}`, label: `groups approved · ${report.periodLabel}` };

  if (submitted && submitted.count > 0) {
    s.attention.push({
      id: "reports-submitted",
      module: "reports",
      tone: "warning",
      count: submitted.count,
      title: pluralize(submitted.count, "group") + " awaiting your approval",
      detail: `${report.periodLabel} member report — review the roster and approve or return it.`,
      href,
      waitingSince: submitted.oldest ? new Date(submitted.oldest) : null,
    });
  }

  if (report.confirmDueAt) {
    const due = new Date(report.confirmDueAt);
    if (due <= w.ahead && waiting > 0) {
      s.attention.push({
        id: "reports-waiting",
        module: "reports",
        tone: due < w.now ? "danger" : "info",
        count: waiting,
        title:
          pluralize(waiting, "group has", "groups have") +
          (due < w.now ? " missed the confirmation deadline" : " not confirmed yet"),
        detail: `${report.periodLabel} member report — reminders go out automatically; a personal nudge often lands better.`,
        href,
        waitingSince: report.openedAt,
      });
    }
    if (due >= w.now && due <= w.ahead) {
      s.upcoming.push({
        id: "reports-due",
        module: "reports",
        kind: "report_due",
        at: due,
        title: `Groups must confirm the ${report.periodLabel} report`,
        detail: `${waiting} still to go.`,
        href,
      });
    }
  }

  for (const row of recentSubmissions) {
    if (!row.submittedAt) continue;
    s.activity.push({
      id: `report-group-${row.id}`,
      module: "reports",
      kind: "report_group_submitted",
      at: row.submittedAt,
      title: `${row.groupName} submitted their roster`,
      detail: pluralize(row.memberCount, "member") + " confirmed.",
      href,
    });
  }

  return s;
}

// ─── Email & workspace ──────────────────────────────────────────────────────

async function emailSignals(orgId: string, w: Window): Promise<Signals> {
  const s = emptySignals();

  const [[problems], [sent], [drift], [syncFailures]] = await Promise.all([
    db
      .select({
        count: countInt,
        oldest: sql<Date | null>`min(${emailActivities.problemAt})`,
      })
      .from(emailActivities)
      .where(
        and(
          eq(emailActivities.orgId, orgId),
          eq(emailActivities.direction, "outbound"),
          inArray(emailActivities.currentStatus, ["bounced", "complained", "failed"]),
          gte(emailActivities.lastStatusAt, w.behind),
        ),
      ),
    db
      .select({ count: countInt })
      .from(emailActivities)
      .where(
        and(
          eq(emailActivities.orgId, orgId),
          eq(emailActivities.direction, "outbound"),
          gte(emailActivities.createdAt, w.behind),
        ),
      ),
    db
      .select({ count: countInt, oldest: sql<Date | null>`min(${workspaceGroupDrift.firstSeenAt})` })
      .from(workspaceGroupDrift)
      .where(and(eq(workspaceGroupDrift.orgId, orgId), eq(workspaceGroupDrift.status, "open"))),
    db
      .select({ count: countInt })
      .from(workspaceSyncOperations)
      .where(
        and(
          eq(workspaceSyncOperations.orgId, orgId),
          eq(workspaceSyncOperations.status, "failed"),
        ),
      ),
  ]);

  s.stats.email = { value: String(sent?.count ?? 0), label: `sent in the last ${BEHIND_DAYS} days` };

  if (problems && problems.count > 0) {
    s.attention.push({
      id: "email-problems",
      module: "email",
      tone: "danger",
      count: problems.count,
      title: pluralize(problems.count, "email") + " bounced or failed",
      detail: "Those members did not get what you sent. Check the address, then resend.",
      href: "/admin/email",
      waitingSince: problems.oldest ? new Date(problems.oldest) : null,
    });
    s.activity.push({
      id: "email-problems-activity",
      module: "email",
      kind: "email_problem",
      at: problems.oldest ? new Date(problems.oldest) : w.now,
      title: pluralize(problems.count, "delivery problem") + " reported",
      detail: "Bounces, complaints and failures from the email provider.",
      href: "/admin/email",
    });
  }

  if (drift && drift.count > 0) {
    s.attention.push({
      id: "workspace-drift",
      module: "settings",
      tone: "info",
      count: drift.count,
      title: pluralize(drift.count, "address", "addresses") + " in Google Groups but not in Spoleek",
      detail: "Adopt them as members, remove them, or mark them as meant to be there.",
      href: "/admin/settings?tab=groups",
      waitingSince: drift.oldest ? new Date(drift.oldest) : null,
    });
  }

  if (syncFailures && syncFailures.count > 0) {
    s.attention.push({
      id: "workspace-sync",
      module: "settings",
      tone: "danger",
      count: syncFailures.count,
      title: pluralize(syncFailures.count, "Google Groups sync", "Google Groups syncs") + " failed",
      detail: "Rosters in Google may be out of date until these are retried.",
      href: "/admin/settings?tab=groups",
      waitingSince: null,
    });
  }

  return s;
}

// ─── Groups ─────────────────────────────────────────────────────────────────

async function groupSignals(orgId: string, owners: Owners): Promise<Signals> {
  const s = emptySignals();
  const [[categories], [groupRows], pendingRows] = await Promise.all([
    db
      .select({ count: countInt })
      .from(groupCategories)
      .where(and(eq(groupCategories.orgId, orgId), eq(groupCategories.isActive, true))),
    db
      .select({ count: countInt })
      .from(groups)
      .where(and(eq(groups.orgId, orgId), eq(groups.isActive, true))),
    // Only groups this admin can decide on: a scoped admin must not be nagged
    // about a queue they cannot open.
    owners.organization || owners.groupIds.length > 0
      ? db
          .select({
            groupId: groups.id,
            categoryId: groups.categoryId,
            groupName: groups.name,
            count: countInt,
            oldest: sql<Date | null>`min(${groupMemberships.requestedAt})`,
          })
          .from(groupMemberships)
          .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
          .where(
            and(
              eq(groupMemberships.orgId, orgId),
              eq(groupMemberships.status, "pending"),
              eq(groups.isActive, true),
              owners.organization ? undefined : inArray(groups.id, owners.groupIds),
            ),
          )
          .groupBy(groups.id, groups.categoryId, groups.name)
      : Promise.resolve([]),
  ]);
  s.stats.groups = {
    value: String(groupRows?.count ?? 0),
    label: `groups in ${pluralize(categories?.count ?? 0, "category", "categories")}`,
  };

  const joinRequests = joinRequestAttention(
    pendingRows.map((row) => ({ ...row, oldest: row.oldest ? new Date(row.oldest) : null })),
  );
  if (joinRequests) s.attention.push(joinRequests);

  return s;
}

// ─── Assembly ───────────────────────────────────────────────────────────────

const MODULE_TITLES: Record<DashboardModule, { title: string; href: string }> = {
  members: { title: "Members", href: "/admin/members" },
  groups: { title: "Groups", href: "/admin/groups" },
  events: { title: "Events", href: "/admin/events" },
  forms: { title: "Forms", href: "/admin/forms" },
  payments: { title: "Payments", href: "/admin/payments" },
  reports: { title: "Reports", href: "/admin/reports" },
  email: { title: "Email", href: "/admin/email" },
  settings: { title: "Settings", href: "/admin/settings" },
};

/**
 * Everything the admin dashboard shows, scoped to what this admin may manage.
 *
 * Each module's signals are gated by the same capability that gates the module
 * itself, so a delegated group admin sees their events and payments and
 * nothing about org-wide email or the member report. Sections run in parallel;
 * each is a handful of aggregate queries rather than row fetches.
 */
export async function getAdminDashboardData(context: AdminContext): Promise<AdminDashboardData> {
  const orgId = context.organization.id;
  const now = new Date();
  const w: Window = {
    now,
    ahead: new Date(now.getTime() + AHEAD_DAYS * DAY_MS),
    behind: new Date(now.getTime() - BEHIND_DAYS * DAY_MS),
  };
  const locale = orgFormatLocale(context.organization.locale);
  const { capabilities } = context;
  const isFull = context.adminAccessLevel === "full";

  const owners: Owners = capabilities.canManageGroups
    ? await listManageableOwners(context)
    : { organization: false, categoryIds: [], groupIds: [] };

  // Scoped payment admins only see fees for members of their groups.
  const paymentMemberIds =
    capabilities.canManagePayments && !isFull && context.member
      ? await listMemberIdsInGroups(orgId, await listScopedGroupIds(orgId, context.member.id))
      : null;

  const sections = await Promise.all([
    capabilities.canManageMembers ? memberSignals(orgId, w) : emptySignals(),
    capabilities.canManageGroups ? groupSignals(orgId, owners) : emptySignals(),
    capabilities.canManageEvents ? eventSignals(orgId, w, owners) : emptySignals(),
    capabilities.canManageEvents ? formSignals(orgId, w, owners) : emptySignals(),
    capabilities.canManagePayments ? paymentSignals(orgId, w, locale, paymentMemberIds) : emptySignals(),
    capabilities.canManageOrganization && context.organization.membershipReportEnabled
      ? reportSignals(orgId, w)
      : emptySignals(),
    capabilities.canManageOrganization ? emailSignals(orgId, w) : emptySignals(),
  ]);

  const attention = rankAttention(sections.flatMap((s) => s.attention));
  const upcoming = sortUpcoming(sections.flatMap((s) => s.upcoming));
  const activity = sortActivity(sections.flatMap((s) => s.activity));
  const stats = Object.assign({}, ...sections.map((s) => s.stats)) as Signals["stats"];

  if (capabilities.canManageOrganization && context.organization.membershipFeeEnabled) {
    const renewal = nextRenewalDate(
      context.organization.membershipRenewalMonth,
      context.organization.membershipRenewalDay,
      now,
    );
    if (renewal && renewal.getTime() - now.getTime() <= RENEWAL_NOTICE_DAYS * DAY_MS) {
      upcoming.push({
        id: "fee-renewal",
        module: "payments",
        kind: "fee_renewal",
        at: renewal,
        title: "Membership fees renew",
        detail: "New fee payments are issued to every active member.",
        href: "/admin/settings?tab=membership",
      });
    }
  }

  const visible: Record<DashboardModule, boolean> = {
    members: capabilities.canManageMembers || capabilities.canManageScopedMembers,
    groups: capabilities.canManageGroups,
    events: capabilities.canManageEvents,
    forms: capabilities.canManageEvents,
    payments: capabilities.canManagePayments,
    reports: capabilities.canManageOrganization && context.organization.membershipReportEnabled,
    email: capabilities.canManageOrganization,
    settings: capabilities.canManageOrganization,
  };

  const modules: ModuleTile[] = MODULE_ORDER.filter((key) => visible[key]).map((key) => ({
    key,
    ...MODULE_TITLES[key],
    stat: stats[key] ?? null,
    alerts: attention.filter((item) => item.module === key).length,
  }));

  return { now, attention, upcoming: sortUpcoming(upcoming), activity, modules };
}
