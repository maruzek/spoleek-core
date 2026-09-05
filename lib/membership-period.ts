import type { MembershipPeriodMode } from "@/server/db/schema";

/**
 * A membership period, resolved to something an admin can be shown verbatim.
 *
 * The label is what ends up on payments (`member_payments.period_label`) and on
 * the yearly report, so the two always agree by construction rather than by two
 * functions happening to format the same way.
 */
export type MembershipPeriod = {
  label: string;
  /** Midnight UTC on the first day. See the note on UTC below. */
  start: Date;
  /** Midnight UTC on the last day. */
  end: Date;
};

/**
 * Period bounds are calendar dates, not instants, and are built and read in UTC
 * throughout.
 *
 * `new Date(2026, 0, 1)` is midnight *local* time, which in Europe/Prague is
 * 2025-12-31T23:00Z. Postgres `date` columns hold no timezone, so that value
 * round-trips as 2025-12-31 and the year silently starts a day early. Every
 * construction below goes through `Date.UTC`, and every formatter that renders
 * one must pass `timeZone: "UTC"` to match.
 */
export const PERIOD_DATE_TIMEZONE = "UTC";

/**
 * Resolves the membership period that `today` falls into.
 *
 * `calendar_year` ignores the renewal month and day entirely: the period is 1
 * January to 31 December and is named for that one year. `renewal_span` is not
 * implemented — callers get the calendar year until it is, which is wrong in a
 * visible way (the label is off) rather than a silent one (the bounds drift).
 *
 * TODO(spanning-periods): implement `renewal_span` so an organization renewing
 * on 1 September gets "2026/2027" running Sep 2026 – Aug 2027, and switch
 * `getPeriodLabel()` in server/lib/payment-lifecycle.ts onto this function.
 */
export function resolveMembershipPeriod(params: {
  mode: MembershipPeriodMode;
  renewalMonth: number | null;
  renewalDay: number | null;
  today: Date;
}): MembershipPeriod {
  // The UTC year, not the local one. `today` is an instant, and reading the
  // year off it locally puts the last hours of 31 December into next year for
  // anyone east of Greenwich — the label would then disagree with the bounds
  // right below it, which are built in UTC.
  const year = params.today.getUTCFullYear();

  return {
    label: String(year),
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31)),
  };
}

/** Whether the mode is one the app can actually run. See the TODO above. */
export function isMembershipPeriodModeImplemented(
  mode: MembershipPeriodMode,
): boolean {
  return mode === "calendar_year";
}

export const membershipPeriodModeOptions: Array<{
  value: MembershipPeriodMode;
  label: string;
  description: string;
  available: boolean;
}> = [
  {
    value: "calendar_year",
    label: "Calendar year",
    description:
      "Membership runs from 1 January to 31 December and is named for that year.",
    available: true,
  },
  {
    value: "renewal_span",
    label: "Renewal to renewal",
    description:
      "Membership runs from the renewal date to the day before the next one, spanning two years.",
    available: false,
  },
];

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: PERIOD_DATE_TIMEZONE,
};

/**
 * The one-sentence summary shown under the renewal settings.
 *
 * Admins currently have to derive the period from a month dropdown and a day
 * input, which nobody does correctly. Stating it back to them is the whole
 * point of the field.
 */
export function describeMembershipPeriod(params: {
  period: MembershipPeriod;
  feeDueAt: Date | null;
  locale: string;
}): string {
  const format = (value: Date) =>
    new Intl.DateTimeFormat(params.locale, DATE_FORMAT).format(value);

  const base = `Membership year ${params.period.label} runs ${format(
    params.period.start,
  )} – ${format(params.period.end)}.`;

  return params.feeDueAt
    ? `${base} Fees are due by ${format(params.feeDueAt)}.`
    : base;
}

/** The day a fee issued at the period start becomes overdue. */
export function getFeeDueDate(periodStart: Date, paymentWindowDays: number): Date {
  const dueAt = new Date(periodStart);
  dueAt.setUTCDate(dueAt.getUTCDate() + paymentWindowDays);
  return dueAt;
}

/**
 * The confirmation deadline for a period, from the organization's month/day.
 *
 * Returns null when no deadline is configured. The date is anchored to the
 * period's own year rather than today's, so reopening the 2026 report in 2027
 * still shows the 2026 deadline.
 */
export function resolveConfirmDueDate(params: {
  period: MembershipPeriod;
  month: number | null;
  day: number | null;
}): Date | null {
  if (params.month == null || params.day == null) return null;

  return new Date(
    Date.UTC(params.period.start.getUTCFullYear(), params.month - 1, params.day),
  );
}
