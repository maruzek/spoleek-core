import type { MembershipStatus } from "@/server/db/schema";

import { MEMBER_STATUS_DISPLAY_ORDER } from "@/lib/member-ordering";

/**
 * How a membership status looks, in one place.
 *
 * The members table renders a status as a `Status` badge and the status filter
 * renders the same status as a coloured dot. Those were two independent
 * mappings in the ReUI block this filter is modelled on — hard-coded Tailwind
 * classes in the filter, a `variant` in the table — which is exactly the
 * arrangement where a status ends up amber in one and grey in the other after
 * someone edits a single file.
 *
 * `variant` is the `Status` component's; `dotClassName` is derived from the
 * same variant's indicator colour so the two cannot drift.
 */
export type MemberStatusVariant =
  | "default"
  | "success"
  | "error"
  | "warning"
  | "info";

const STATUS_VARIANTS: Record<MembershipStatus, MemberStatusVariant> = {
  active: "success",
  suspended: "error",
  pending: "warning",
  invited: "info",
  archived: "default",
  deleted: "default",
};

const DOT_CLASSES: Record<MemberStatusVariant, string> = {
  default: "bg-muted-foreground",
  success: "bg-green-600 dark:bg-green-400",
  error: "bg-destructive",
  warning: "bg-orange-600 dark:bg-orange-400",
  info: "bg-blue-600 dark:bg-blue-400",
};

export function getMemberStatusVariant(
  status: MembershipStatus,
): MemberStatusVariant {
  return STATUS_VARIANTS[status] ?? "default";
}

export function getMemberStatusDotClassName(status: MembershipStatus) {
  return DOT_CLASSES[getMemberStatusVariant(status)];
}

export function getMemberStatusLabel(status: MembershipStatus) {
  const label = status.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The filter's options, in the table's own display order so the dropdown reads
 * top-to-bottom the way the rows sort.
 */
export const MEMBER_STATUS_OPTIONS = MEMBER_STATUS_DISPLAY_ORDER.map(
  (status) => ({
    value: status,
    label: getMemberStatusLabel(status),
    dotClassName: getMemberStatusDotClassName(status),
  }),
);

/**
 * Everything except `deleted`.
 *
 * The default selection, and the thing the URL is compared against to decide
 * whether the `status` param is worth writing — see
 * `components/app/member-status-filter.tsx`.
 */
export const DEFAULT_MEMBER_STATUS_FILTER: MembershipStatus[] =
  MEMBER_STATUS_DISPLAY_ORDER.filter((status) => status !== "deleted");

const VALID_STATUSES = new Set<string>(MEMBER_STATUS_DISPLAY_ORDER);

/**
 * Reads the `?status=` search param.
 *
 * An absent param means the default. An unparseable or entirely unknown one
 * also means the default rather than an empty table — a stale bookmark should
 * degrade to the normal roster, not to "no members found".
 *
 * An *empty* selection the user made deliberately is a different thing, and is
 * carried as the literal `none` so it survives a reload.
 */
export function parseMemberStatusFilter(
  raw: string | string[] | undefined,
): MembershipStatus[] {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (value == null || value.length === 0) {
    return DEFAULT_MEMBER_STATUS_FILTER;
  }

  if (value === "none") {
    return [];
  }

  const parsed = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => VALID_STATUSES.has(part)) as MembershipStatus[];

  return parsed.length > 0 ? parsed : DEFAULT_MEMBER_STATUS_FILTER;
}

/** Inverse of `parseMemberStatusFilter`; null means "omit the param". */
export function serializeMemberStatusFilter(
  statuses: MembershipStatus[],
): string | null {
  if (statuses.length === 0) {
    return "none";
  }

  const isDefault =
    statuses.length === DEFAULT_MEMBER_STATUS_FILTER.length &&
    DEFAULT_MEMBER_STATUS_FILTER.every((status) => statuses.includes(status));

  if (isDefault) {
    return null;
  }

  // Serialized in display order rather than click order, so the same selection
  // always produces the same URL and links compare equal.
  return MEMBER_STATUS_DISPLAY_ORDER.filter((status) =>
    statuses.includes(status),
  ).join(",");
}
