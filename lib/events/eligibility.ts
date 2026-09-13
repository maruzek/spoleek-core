import type { EventAudienceKind } from "@/server/db/schema";

/**
 * Audience resolution as pure set algebra.
 *
 * The query layer loads the rule rows, the org's group memberships and the
 * group→category map, then calls this. Nothing is snapshotted: a member who
 * joins a targeted group tomorrow is invited tomorrow, one who leaves is not.
 */

/** The slice of `event_audience` that resolves to members. */
export type AudienceRule = {
  kind: EventAudienceKind;
  groupId: string | null;
  categoryId: string | null;
  memberId: string | null;
};

export type GroupMembershipRow = {
  groupId: string;
  memberId: string;
};

/**
 * Every member the audience rules reach.
 *
 * Union of: active members of each `group` rule; active members of every group
 * in each `category` rule; each `member` rule. `external` rules are not
 * members and are reached only by token, so they contribute nothing here.
 *
 * `activeMemberIds` is the gate for every kind, including `member` rules: an
 * explicitly named member who is pending, suspended or deleted is not
 * eligible either. "Eligible" therefore always implies "active member", so
 * the copy and send lists can never reach a suspended person, and a manager
 * who wants an alumnus at a reunion adds them as an external invitee.
 */
export function resolveEligibleMemberIds(params: {
  rules: readonly AudienceRule[];
  groupMemberships: readonly GroupMembershipRow[];
  /** groupId → categoryId, for every group in the org. */
  groupsByCategory: ReadonlyMap<string, string>;
  activeMemberIds: ReadonlySet<string>;
}): Set<string> {
  const { rules, groupMemberships, groupsByCategory, activeMemberIds } = params;

  const targetGroupIds = new Set<string>();
  const targetCategoryIds = new Set<string>();
  const eligible = new Set<string>();

  for (const rule of rules) {
    if (rule.kind === "group" && rule.groupId) targetGroupIds.add(rule.groupId);
    else if (rule.kind === "category" && rule.categoryId) {
      targetCategoryIds.add(rule.categoryId);
    } else if (rule.kind === "member" && rule.memberId) {
      if (activeMemberIds.has(rule.memberId)) eligible.add(rule.memberId);
    }
    // `external` rules are not members.
  }

  if (targetGroupIds.size === 0 && targetCategoryIds.size === 0) return eligible;

  for (const membership of groupMemberships) {
    if (!activeMemberIds.has(membership.memberId)) continue;
    const categoryId = groupsByCategory.get(membership.groupId);
    if (
      targetGroupIds.has(membership.groupId) ||
      (categoryId !== undefined && targetCategoryIds.has(categoryId))
    ) {
      eligible.add(membership.memberId);
    }
  }

  return eligible;
}

/** Convenience for the single-member check the portal and actions need. */
export function isMemberEligible(
  memberId: string,
  params: Parameters<typeof resolveEligibleMemberIds>[0],
): boolean {
  return resolveEligibleMemberIds(params).has(memberId);
}
