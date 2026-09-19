import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  type GroupMembershipRole,
  type GroupMembershipStatus,
  groupCategories,
  groupMemberships,
  groups,
  tenantMembers,
} from "@/server/db/schema";
import {
  resolveSelectionViolation,
  type SelectionViolation,
} from "@/lib/groups/selection-limit";

/**
 * `db` or a transaction. The upsert opens its own transaction on it, which on
 * an outer transaction becomes a savepoint, so the lock below holds whichever
 * the caller passes.
 */
type DbExecutor = Pick<typeof db, "transaction">;

/**
 * Only `active` rows are memberships; `pending` / `declined` are join requests.
 * Every read of `groupMemberships` outside the portal request view carries this
 * (audit table: docs/superpowers/specs/2026-09-17-portal-groups-self-service-design.md §1).
 */
export const activeMembership = () => eq(groupMemberships.status, "active");

/**
 * The write was refused because it would break the category's selection
 * invariant. `message` is human-readable and names the category; the
 * safe-action client forwards it as the error the UI shows.
 */
export class GroupMembershipError extends Error {
  constructor(
    public readonly code: SelectionViolation,
    public readonly categoryName: string,
    public readonly maxSelections: number | null,
  ) {
    super(
      code === "SINGLE_SELECT_TAKEN"
        ? `${categoryName} allows only one group per member.`
        : `${categoryName} allows at most ${maxSelections} groups per member.`,
    );
    this.name = "GroupMembershipError";
  }
}

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
 * It also owns the Group Category selection invariant ("one group per
 * single-select category, ≤ `maxSelections` per multi-select"), throwing
 * `GroupMembershipError` when the write would break it. Callers that *switch*
 * a member between groups delete the old row first, in the same transaction.
 *
 * Returns the row id and the status it had before the call (`null` when the
 * row is new) so callers can tell "approved by assignment" from "new member".
 */
export async function upsertActiveMembership(
  executor: DbExecutor,
  params: {
    orgId: string;
    groupId: string;
    memberId: string;
    role?: GroupMembershipRole;
  },
): Promise<{ id: string; previousStatus: GroupMembershipStatus | null }> {
  const role = params.role ?? "member";

  return executor.transaction(async (tx) => {
    // Serialise membership writes per member: two concurrent inserts into a
    // single-select category would each count zero other rows and both
    // succeed. Locking the member row makes the second writer wait for the
    // first to commit, and then see its row in the count below.
    await tx
      .select({ id: tenantMembers.id })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.orgId, params.orgId), eq(tenantMembers.id, params.memberId)))
      .for("update");

    const [category] = await tx
      .select({
        id: groupCategories.id,
        name: groupCategories.name,
        selectionMode: groupCategories.selectionMode,
        maxSelections: groupCategories.maxSelections,
      })
      .from(groups)
      .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
      .where(and(eq(groups.orgId, params.orgId), eq(groups.id, params.groupId)))
      .limit(1);

    if (!category) {
      throw new Error("The selected group could not be found.");
    }

    const [{ count: activeOtherCount }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(groupMemberships)
      .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
      .where(
        and(
          eq(groupMemberships.orgId, params.orgId),
          eq(groupMemberships.memberId, params.memberId),
          activeMembership(),
          eq(groups.categoryId, category.id),
          ne(groupMemberships.groupId, params.groupId),
        ),
      );

    const violation = resolveSelectionViolation(category, activeOtherCount);

    if (violation) {
      throw new GroupMembershipError(violation, category.name, category.maxSelections);
    }

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
  });
}

/**
 * Replace a member's memberships *within* `allowedGroupIds` with `nextGroupIds`
 * — the member form's group picker, where the caller only sees (and may only
 * touch) the groups in its management scope. Rows outside the allowlist are
 * left alone. Deletes run before inserts so a single-select switch passes the
 * invariant in `upsertActiveMembership`.
 */
export async function syncManageableGroupMemberships(args: {
  memberId: string;
  orgId: string;
  allowedGroupIds: string[];
  nextGroupIds: string[];
  tx: Pick<typeof db, "select" | "insert" | "delete" | "transaction">;
}) {
  const uniqueAllowedGroupIds = [...new Set(args.allowedGroupIds)];
  const uniqueNextGroupIds = [...new Set(args.nextGroupIds)];

  if (uniqueAllowedGroupIds.length === 0) {
    return;
  }

  const existingMemberships = await args.tx
    .select({
      id: groupMemberships.id,
      groupId: groupMemberships.groupId,
    })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, args.orgId),
        activeMembership(),
        eq(groupMemberships.memberId, args.memberId),
        inArray(groupMemberships.groupId, uniqueAllowedGroupIds),
      ),
    );

  const existingGroupIds = new Set(
    existingMemberships.map((membership) => membership.groupId),
  );
  const nextGroupIdsSet = new Set(uniqueNextGroupIds);

  const membershipIdsToDelete = existingMemberships
    .filter((membership) => !nextGroupIdsSet.has(membership.groupId))
    .map((membership) => membership.id);

  if (membershipIdsToDelete.length > 0) {
    await args.tx
      .delete(groupMemberships)
      .where(
        and(
          eq(groupMemberships.orgId, args.orgId),
          inArray(groupMemberships.id, membershipIdsToDelete),
        ),
      );
  }

  const groupIdsToInsert = uniqueNextGroupIds.filter(
    (groupId) => !existingGroupIds.has(groupId),
  );

  for (const groupId of groupIdsToInsert) {
    await upsertActiveMembership(args.tx, {
      orgId: args.orgId,
      groupId,
      memberId: args.memberId,
    });
  }
}
