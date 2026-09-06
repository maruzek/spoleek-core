import type { MembershipReportGroupStatus } from "@/server/db/schema";

export type StatusVariant = "default" | "success" | "error" | "warning" | "info";

export type ReportGroupStatusPresentation = {
  label: string;
  variant: StatusVariant;
  /**
   * What the status means, in a sentence. `{group}` is replaced with the group
   * name — a bare badge reading "Not started" next to a year reads as though
   * the year had not started, rather than as this group's confirmation state.
   */
  description: string;
  /** Whether this status still needs someone to act. */
  needsAttention: boolean;
};

/**
 * Display order for the board's group table.
 *
 * Deliberately independent of the enum's declaration order, and deliberately
 * not alphabetical: the rows that need chasing sort to the top, so a region
 * nobody has heard from cannot sink out of sight the way suspended members
 * used to in the roster.
 */
export const REPORT_GROUP_STATUS_ORDER = [
  "returned",
  "not_started",
  "in_progress",
  "submitted",
  "approved",
] as const satisfies readonly MembershipReportGroupStatus[];

export const REPORT_GROUP_STATUS: Record<
  MembershipReportGroupStatus,
  ReportGroupStatusPresentation
> = {
  returned: {
    label: "Sent back",
    variant: "error",
    description: "The board sent {group}'s report back for changes.",
    needsAttention: true,
  },
  not_started: {
    label: "Not confirmed",
    variant: "warning",
    description: "{group} has not confirmed its members for this year yet.",
    needsAttention: true,
  },
  in_progress: {
    label: "Being prepared",
    variant: "info",
    description: "{group} has started confirming but has not submitted yet.",
    needsAttention: true,
  },
  submitted: {
    label: "Waiting for board",
    variant: "info",
    description: "{group} has submitted. The board has not reviewed it yet.",
    needsAttention: false,
  },
  approved: {
    label: "Approved",
    variant: "success",
    description: "The board approved {group}'s report.",
    needsAttention: false,
  },
};

export function describeReportGroupStatus(
  status: MembershipReportGroupStatus,
  groupName: string,
): string {
  return REPORT_GROUP_STATUS[status].description.replace("{group}", groupName);
}

export function compareReportGroupStatus(
  a: MembershipReportGroupStatus,
  b: MembershipReportGroupStatus,
): number {
  return (
    REPORT_GROUP_STATUS_ORDER.indexOf(a) - REPORT_GROUP_STATUS_ORDER.indexOf(b)
  );
}

/**
 * Whole days from today until `due`, negative once it has passed.
 *
 * `due` is a calendar date read from a `date` column and is therefore midnight
 * UTC; `now` is a real instant. Both are reduced to a UTC day number so a
 * viewer east of Greenwich does not see the deadline shift by one.
 */
export function daysUntil(due: Date, now: Date = new Date()): number {
  const utcDay = (value: Date) =>
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return Math.round((utcDay(due) - utcDay(now)) / 86_400_000);
}

/**
 * How a status paints outside a `Status` pill — the segments of the progress
 * bar and the dots in its legend.
 *
 * Kept next to the labels so the board and the group pages cannot drift into
 * two different colour vocabularies for the same five words.
 */
export const REPORT_STATUS_TONE: Record<
  StatusVariant,
  { bar: string; dot: string }
> = {
  default: { bar: "bg-muted-foreground/40", dot: "bg-muted-foreground/40" },
  success: { bar: "bg-green-600 dark:bg-green-400", dot: "bg-green-600 dark:bg-green-400" },
  error: { bar: "bg-destructive", dot: "bg-destructive" },
  warning: { bar: "bg-orange-500 dark:bg-orange-400", dot: "bg-orange-500 dark:bg-orange-400" },
  info: { bar: "bg-blue-500 dark:bg-blue-400", dot: "bg-blue-500 dark:bg-blue-400" },
};
