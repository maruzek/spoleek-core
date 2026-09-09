import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

import type { MembershipStatus } from "@/server/db/schema";

/**
 * Display order for member statuses in the admin members table.
 *
 * Pending members come first so admins see the approval queue without
 * filtering; invited members follow (they still need chasing), then the live
 * roster, with suspended, archived and deleted sinking to the bottom.
 *
 * `deleted` is last and is only ever present when the viewer explicitly asked
 * for it — see the status filter in `components/app/member-status-filter.tsx`.
 *
 * This is deliberately independent of the `membership_status` enum's
 * declaration order — Postgres sorts enum columns by declaration order, so
 * without an explicit rank the UI would silently reorder itself the next time
 * someone appends a value to the enum.
 */
export const MEMBER_STATUS_DISPLAY_ORDER = [
  "pending",
  "invited",
  "active",
  "suspended",
  "archived",
  "deleted",
] as const satisfies readonly MembershipStatus[];

const UNRANKED_STATUS_RANK = MEMBER_STATUS_DISPLAY_ORDER.length;

/**
 * `CASE` expression ranking a status column for `ORDER BY`.
 *
 * Ranks are emitted as bound parameters and the status values come from a
 * typed constant, so no user input reaches the SQL text.
 */
export function memberStatusSortRank(column: SQLWrapper): SQL<number> {
  const branches = MEMBER_STATUS_DISPLAY_ORDER.map(
    (status, rank) => sql`when ${status} then ${rank}`,
  );

  return sql<number>`case ${column} ${sql.join(branches, sql` `)} else ${UNRANKED_STATUS_RANK} end`;
}
