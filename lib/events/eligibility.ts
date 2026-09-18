import type { EventAudienceKind } from "@/server/db/schema";

/**
 * Audience resolution as pure set algebra.
 *
 * The query layer loads the rule rows, the org's group memberships and the
 * group→category map, then calls this. Nothing is snapshotted: a member who
 * joins a targeted group tomorrow is invited tomorrow, one who leaves is not.
 *
 * Shared by events and forms: a form rule carries a `scope` that narrows a
 * group or category to its admins; event rules never set it.
 */

export type AudienceScope = "members" | "admins";

/** The slice of `event_audience` / `form_audience` that resolves to members. */
export type AudienceRule = {
  kind: EventAudienceKind;
  groupId: string | null;
  categoryId: string | null;
  memberId: string | null;
  /** Defaults to `members`. Ignored for `member` and `external` rules. */
  scope?: AudienceScope;
};

export type GroupMembershipRow = {
  groupId: string;
  memberId: string;
  /** Only needed when a rule has `scope: "admins"`. */
  role?: "member" | "group_admin";
};

export type CategoryAdminRow = {
  categoryId: string;
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
 *
 * With `scope: "admins"` a group rule reaches only its `group_admin`
 * memberships and a category rule only the category's admins
 * (`categoryAdmins`) — not the group admins of its groups, which is a
 * different role and a different rule.
 */
export function resolveEligibleMemberIds(params: {
  rules: readonly AudienceRule[];
  /**
   * Active memberships only. This module is pure and does not know about
   * `group_memberships.status`; the DB callers (server/queries/events.ts,
   * server/queries/forms.ts) filter with `activeMembership()` before passing
   * rows in, so a pending join request never targets anyone.
   */
  groupMemberships: readonly GroupMembershipRow[];
  /** groupId → categoryId, for every group in the org. */
  groupsByCategory: ReadonlyMap<string, string>;
  activeMemberIds: ReadonlySet<string>;
  /** Only consulted by category rules scoped to `admins`. */
  categoryAdmins?: readonly CategoryAdminRow[];
}): Set<string> {
  const {
    rules,
    groupMemberships,
    groupsByCategory,
    activeMemberIds,
    categoryAdmins = [],
  } = params;

  const targetGroupIds = new Set<string>();
  const adminGroupIds = new Set<string>();
  const targetCategoryIds = new Set<string>();
  const adminCategoryIds = new Set<string>();
  const eligible = new Set<string>();

  for (const rule of rules) {
    const admins = rule.scope === "admins";
    if (rule.kind === "group" && rule.groupId) {
      (admins ? adminGroupIds : targetGroupIds).add(rule.groupId);
    } else if (rule.kind === "category" && rule.categoryId) {
      (admins ? adminCategoryIds : targetCategoryIds).add(rule.categoryId);
    } else if (rule.kind === "member" && rule.memberId) {
      if (activeMemberIds.has(rule.memberId)) eligible.add(rule.memberId);
    }
    // `external` rules are not members.
  }

  if (adminCategoryIds.size > 0) {
    for (const admin of categoryAdmins) {
      if (
        adminCategoryIds.has(admin.categoryId) &&
        activeMemberIds.has(admin.memberId)
      ) {
        eligible.add(admin.memberId);
      }
    }
  }

  if (
    targetGroupIds.size === 0 &&
    targetCategoryIds.size === 0 &&
    adminGroupIds.size === 0
  ) {
    return eligible;
  }

  for (const membership of groupMemberships) {
    if (!activeMemberIds.has(membership.memberId)) continue;
    const categoryId = groupsByCategory.get(membership.groupId);
    if (
      targetGroupIds.has(membership.groupId) ||
      (categoryId !== undefined && targetCategoryIds.has(categoryId)) ||
      (membership.role === "group_admin" && adminGroupIds.has(membership.groupId))
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
