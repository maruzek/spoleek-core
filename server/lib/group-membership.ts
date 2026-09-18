import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  type GroupMembershipRole,
  type GroupMembershipStatus,
  groupMemberships,
} from "@/server/db/schema";

type DbExecutor = Pick<typeof db, "select" | "insert">;

/**
 * Only `active` rows are memberships; `pending` / `declined` are join requests.
 * Every read of `groupMemberships` outside the portal request view carries this
 * (audit table: docs/superpowers/specs/2026-09-17-portal-groups-self-service-design.md §1).
 */
export const activeMembership = () => eq(groupMemberships.status, "active");

/**
 * The one way to create an active group membership.
 *
 * `group_memberships` holds join requests (`pending` / `declined`) in the same
 * row a membership will later occupy, so a plain insert would either collide
 * with the request or silently leave it un-approved. This upserts on
 * `(group_id, member_id)`: a missing row is inserted active, an existing row in
 * any state is flipped to active with its request/decision fields cleared.
 * Role is the greater of existing and requested, so re-assigning a group admin
 * as a member never demotes them.
 *
 * Returns the row id and the status it had before the call (`null` when the
 * row is new) so callers can tell "approved by assignment" from "new member".
 */
export async function upsertActiveMembership(
  tx: DbExecutor,
  params: {
    orgId: string;
    groupId: string;
    memberId: string;
    role?: GroupMembershipRole;
  },
): Promise<{ id: string; previousStatus: GroupMembershipStatus | null }> {
  const role = params.role ?? "member";

  const [existing] = await tx
    .select({ status: groupMemberships.status })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, params.orgId),
        eq(groupMemberships.groupId, params.groupId),
        eq(groupMemberships.memberId, params.memberId),
      ),
    )
    .limit(1);

  const [row] = await tx
    .insert(groupMemberships)
    .values({
      orgId: params.orgId,
      groupId: params.groupId,
      memberId: params.memberId,
      role,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [groupMemberships.groupId, groupMemberships.memberId],
      set: {
        status: "active",
        role: sql`case when ${groupMemberships.role} = 'group_admin' or excluded.role = 'group_admin' then 'group_admin'::group_membership_role else 'member'::group_membership_role end`,
        requestMessage: null,
        requestedAt: null,
        decidedAt: null,
        decidedByMemberId: null,
        declineReason: null,
        requestsBlocked: false,
        updatedAt: new Date(),
      },
    })
    .returning({ id: groupMemberships.id });

  return { id: row.id, previousStatus: existing?.status ?? null };
}
