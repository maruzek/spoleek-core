/**
 * Admin dashboard model.
 *
 * The dashboard is a briefing, not a report: three questions, in this order.
 *
 *   1. What needs me?         → `AttentionItem` — a queue the admin can drain.
 *   2. What is about to happen? → `UpcomingItem` — dated, soonest first.
 *   3. What just happened?     → `ActivityItem` — dated, newest first.
 *
 * Plus a `ModuleTile` per module, so the page doubles as the way into each one.
 *
 * Everything here is pure so the ranking and date maths can be tested without
 * a database; `server/queries/dashboard.ts` fills these shapes in.
 */

export type DashboardModule =
  | "members"
  | "groups"
  | "events"
  | "forms"
  | "payments"
  | "reports"
  | "email"
  | "settings";

export const MODULE_ORDER: DashboardModule[] = [
  "members",
  "groups",
  "events",
  "forms",
  "payments",
  "reports",
  "email",
  "settings",
];

/**
 * How loudly an item asks for attention.
 *
 * `danger` is something already wrong (an overdue fee, a bounced invite).
 * `warning` is a decision waiting on the admin (a join request, a report to
 * approve). `info` is worth knowing, not worth interrupting for.
 */
export type AttentionTone = "danger" | "warning" | "info";

export type AttentionItem = {
  id: string;
  module: DashboardModule;
  tone: AttentionTone;
  /** How many things sit behind this line. Shown as the big numeral. */
  count: number;
  title: string;
  detail: string;
  href: string;
  /** When the oldest thing in this bucket started waiting, if known. */
  waitingSince: Date | null;
  /**
   * Gets a coloured marker in the list. Reserved for the few buckets where
   * a real person is stuck until the admin acts — money owed and people
   * waiting to get in — so the colour still means something when it appears.
   */
  urgent?: boolean;
};

export type UpcomingKind =
  | "event"
  | "rsvp_deadline"
  | "payment_due"
  | "form_closes"
  | "report_due"
  | "fee_renewal"
  | "member_purge";

export type UpcomingItem = {
  id: string;
  module: DashboardModule;
  kind: UpcomingKind;
  at: Date;
  title: string;
  detail: string;
  href: string;
};

export type ActivityKind =
  | "join_request"
  | "member_activated"
  | "rsvp"
  | "event_happened"
  | "form_submissions"
  | "payments_confirmed"
  | "report_group_submitted"
  | "email_problem";

export type ActivityItem = {
  id: string;
  module: DashboardModule;
  kind: ActivityKind;
  at: Date;
  title: string;
  detail: string;
  href: string;
};

export type ModuleTile = {
  key: DashboardModule;
  title: string;
  href: string;
  /** The one number worth seeing before clicking through, if any. */
  stat: { value: string; label: string } | null;
  /** Items in the attention queue that belong to this module. */
  alerts: number;
};

export type AdminDashboardData = {
  now: Date;
  attention: AttentionItem[];
  upcoming: UpcomingItem[];
  activity: ActivityItem[];
  modules: ModuleTile[];
};

const TONE_RANK: Record<AttentionTone, number> = { danger: 0, warning: 1, info: 2 };

/**
 * Orders the attention queue.
 *
 * TODO(you): this is the policy that decides what an admin sees first every
 * morning. The placeholder sorts by tone only. Think about whether, within a
 * tone, the bucket with the most items or the one that has waited longest
 * should come first — a single join request from two weeks ago versus twelve
 * overdue fees from yesterday is the case to reason about.
 */
export function rankAttention(items: readonly AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}

/** Soonest first; ties broken by title so the order is stable across renders. */
export function sortUpcoming(items: readonly UpcomingItem[]): UpcomingItem[] {
  return [...items].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.title.localeCompare(b.title),
  );
}

/** Newest first. */
export function sortActivity(items: readonly ActivityItem[]): ActivityItem[] {
  return [...items].sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * The next membership-fee renewal date on or after `now`.
 *
 * Renewal is stored as a month/day pair with no year. A day that does not
 * exist in the target month (31 February) clamps to that month's last day
 * rather than rolling into the next one, which is what an admin who typed
 * "the end of the month" meant.
 */
export function nextRenewalDate(
  month: number | null,
  day: number | null,
  now: Date,
): Date | null {
  if (month == null || day == null) return null;

  const build = (year: number) => {
    const lastDay = new Date(year, month, 0).getDate();
    return new Date(year, month - 1, Math.min(day, lastDay));
  };

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = build(now.getFullYear());
  return thisYear >= today ? thisYear : build(now.getFullYear() + 1);
}

/** Whole calendar days from `now` to `at`; negative when `at` is in the past. */
export function daysUntil(at: Date, now: Date): number {
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const end = Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
  return Math.round((end - start) / 86_400_000);
}

/**
 * Buckets the upcoming list by relative day so the timeline can print one
 * "Today" / "Tomorrow" / "Fri 19 Sep" heading per group instead of a date on
 * every row.
 */
export function groupByDay<T extends { at: Date }>(
  items: readonly T[],
  now: Date,
): { dayOffset: number; date: Date; items: T[] }[] {
  const groups = new Map<number, { dayOffset: number; date: Date; items: T[] }>();
  for (const item of items) {
    const dayOffset = daysUntil(item.at, now);
    const existing = groups.get(dayOffset);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(dayOffset, {
        dayOffset,
        date: new Date(item.at.getFullYear(), item.at.getMonth(), item.at.getDate()),
        items: [item],
      });
    }
  }
  return [...groups.values()];
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The "join requests waiting" attention line, from per-group pending counts.
 *
 * One group → link straight to its Requests tab and name it; several → the
 * groups overview, where the badges point the way. Null when nothing waits,
 * so the caller can `push` unconditionally.
 */
export function joinRequestAttention(
  rows: readonly { groupId: string; categoryId: string; groupName: string; count: number; oldest: Date | null }[],
): AttentionItem | null {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return null;

  const oldest = rows
    .map((row) => row.oldest)
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const single = rows.length === 1 ? rows[0] : null;

  return {
    id: "groups-join-requests",
    module: "groups",
    tone: "warning",
    urgent: true,
    count: total,
    title: `${pluralize(total, "join request")} waiting`,
    detail: single
      ? `${single.groupName} — a member is waiting to be let in.`
      : `Across ${pluralize(rows.length, "group")}; approve or decline from each group's Requests tab.`,
    href: single ? `/admin/groups/${single.categoryId}/${single.groupId}?tab=requests` : "/admin/groups",
    waitingSince: oldest,
  };
}
