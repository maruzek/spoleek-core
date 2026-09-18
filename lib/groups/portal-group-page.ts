import type { GroupPageAccessLevel } from "@/lib/groups/portal-actions";

/**
 * Pure bucketing for the portal group page. The query fetches the viewer-scoped
 * events, forms and payments it already has for the list page and hands the
 * arrays here, so the rules are testable without a database and no new
 * eligibility SQL exists — whatever the viewer may see elsewhere is exactly
 * what they may see here, narrowed to one group.
 */

/** Past events rendered before the "show all" toggle. A UI cap, not applied here. */
export const PAST_EVENTS_CAP = 20;

type EventLike = {
  event: { id: string; ownerGroupId: string | null; startsAt: Date | null; endsAt: Date | null };
};

type FormLike = {
  form: { id: string; ownerGroupId: string | null };
  /** Non-null for event-attached forms, which the event page lists instead. */
  event: { id: string } | null;
  open: { open: boolean };
  submittedAt: Date | null;
};

export type GroupEventRelation = "owned" | "invited";

export type GroupEventItem<T extends EventLike = EventLike> = T & {
  relation: GroupEventRelation;
};

export type GroupFormItem<T extends FormLike = FormLike> = T & { submitted: boolean };

export type BucketGroupEventsInput<T extends EventLike> = {
  groupId: string;
  now: Date;
  /** `listEventsForViewer` output: already filtered to what the viewer may see. */
  viewer: { invited: readonly T[]; open: readonly T[]; past: readonly T[] };
  /** Events whose audience rules include this group (from `eventAudience`). */
  invitedEventIds: ReadonlySet<string>;
  access: GroupPageAccessLevel;
};

/** Soonest first; undated events last, stable among themselves. */
function bySoonest(a: EventLike, b: EventLike) {
  const sa = a.event.startsAt?.getTime();
  const sb = b.event.startsAt?.getTime();
  if (sa === undefined && sb === undefined) return 0;
  if (sa === undefined) return 1;
  if (sb === undefined) return -1;
  return sa - sb;
}

/** Newest first, by the instant the event was over. */
function byNewest(a: EventLike, b: EventLike) {
  const ea = (a.event.endsAt ?? a.event.startsAt)?.getTime() ?? 0;
  const eb = (b.event.endsAt ?? b.event.startsAt)?.getTime() ?? 0;
  return eb - ea;
}

/**
 * Splits the viewer's events into the three lists the page shows.
 *
 * `upcoming` is everything not yet over that the group owns — including an
 * event that has started but not ended, and one with no date at all.
 * `alsoInvited` is owned elsewhere but targeted at this group. `past` is the
 * group's own history, members only: a visitor sees where the group is going,
 * not where it has been.
 */
export function bucketGroupEvents<T extends EventLike>(
  params: BucketGroupEventsInput<T>,
): { upcoming: GroupEventItem<T>[]; alsoInvited: GroupEventItem<T>[]; past: GroupEventItem<T>[] } {
  const { groupId, viewer, invitedEventIds, access } = params;
  const live = [...viewer.invited, ...viewer.open];

  const upcoming = live
    .filter((item) => item.event.ownerGroupId === groupId)
    .map((item) => ({ ...item, relation: "owned" as const }))
    .sort(bySoonest);

  const alsoInvited = live
    .filter(
      (item) => item.event.ownerGroupId !== groupId && invitedEventIds.has(item.event.id),
    )
    .map((item) => ({ ...item, relation: "invited" as const }))
    .sort(bySoonest);

  const past =
    access === "member"
      ? viewer.past
          .filter((item) => item.event.ownerGroupId === groupId)
          .map((item) => ({ ...item, relation: "owned" as const }))
          .sort(byNewest)
      : [];

  return { upcoming, alsoInvited, past };
}

export type BucketGroupFormsInput<T extends FormLike> = {
  groupId: string;
  /** `listFormsForViewer` pending + submitted, concatenated. */
  items: readonly T[];
  access: GroupPageAccessLevel;
};

/**
 * Standalone forms the group owns. Event-attached forms are left out — the
 * event row links to the event page, which already lists them. `open` accepts
 * submissions right now; `past` is closed forms the viewer answered, kept so
 * their copy stays reachable. Visitors get no `past`.
 */
export function bucketGroupForms<T extends FormLike>(
  params: BucketGroupFormsInput<T>,
): { open: GroupFormItem<T>[]; past: GroupFormItem<T>[] } {
  const { groupId, items, access } = params;

  const owned = items
    .filter((item) => item.event === null && item.form.ownerGroupId === groupId)
    .map((item) => ({ ...item, submitted: item.submittedAt !== null }));

  return {
    open: owned.filter((item) => item.open.open),
    past:
      access === "member"
        ? owned.filter((item) => !item.open.open && item.submitted)
        : [],
  };
}

/**
 * The next renewal date, midnight UTC, or null when the group has no renewal
 * day. Calendar dates are built in UTC for the reasons spelled out in
 * `lib/membership-period.ts`. A day past the month's end (31 April) clamps to
 * the last day of that month rather than rolling into the next.
 */
export function nextFeeRenewal(
  group: { feeRenewalMonth: number | null; feeRenewalDay: number | null },
  now: Date,
): Date | null {
  const { feeRenewalMonth, feeRenewalDay } = group;
  if (feeRenewalMonth === null || feeRenewalDay === null) return null;

  const build = (year: number) => {
    const lastDay = new Date(Date.UTC(year, feeRenewalMonth, 0)).getUTCDate();
    return new Date(Date.UTC(year, feeRenewalMonth - 1, Math.min(feeRenewalDay, lastDay)));
  };

  const thisYear = build(now.getUTCFullYear());
  return thisYear >= now ? thisYear : build(now.getUTCFullYear() + 1);
}

/**
 * When the viewer became a member. The `group_memberships` row is reused
 * across the request lifecycle, so `createdAt` alone would date an approved
 * request from the day it was asked; `decidedAt` is the approval.
 */
export function memberSince(row: { decidedAt: Date | null; createdAt: Date }): Date {
  return row.decidedAt ?? row.createdAt;
}
