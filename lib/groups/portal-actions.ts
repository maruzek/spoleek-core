import type {
  GroupCategorySelectionMode,
  GroupJoinPolicy,
  GroupMembershipStatus,
  GroupPageVisibility,
} from "@/server/db/schema";

/**
 * Why a self-service action is unavailable. Keys, not copy: the portal
 * translates them (lib/i18n/messages.ts) so this module stays pure.
 */
export type PortalBlockedReason =
  /** Single-select category, current group is not free to leave (or this one is not free to join). */
  | "ask_leader_to_switch"
  /** Single-select category; a request here could never be approved while the member is elsewhere. */
  | "leave_current_first"
  /** Multi-select category at `maxSelections`. */
  | "max_selections_reached";

export type PortalLeaveBlockedReason =
  /** Policy is `admin_only` or `request_to_join`. */
  | "policy"
  /** `selectionRequired` and this is the member's only group in the category. */
  | "selection_required";

export type PortalAvailableAction =
  | { kind: "join" }
  | { kind: "switch"; from: { id: string; name: string } }
  | { kind: "request" }
  | { kind: "pending"; requestedAt: Date }
  | { kind: "declined"; decidedAt: Date; reason: string | null; canRequestAgain: boolean }
  | { kind: "ask_leader" }
  | { kind: "blocked"; reason: PortalBlockedReason };

export type PortalActionGroup = { id: string; joinPolicy: GroupJoinPolicy };

export type PortalActionRow = {
  status: GroupMembershipStatus;
  requestedAt: Date | null;
  decidedAt: Date | null;
  declineReason: string | null;
  requestsBlocked: boolean;
};

export type PortalActionCategory = {
  selectionMode: GroupCategorySelectionMode;
  maxSelections: number | null;
  selectionRequired: boolean;
  showGroupsToNonMembers: boolean;
};

export type PortalActiveGroup = { id: string; name: string; joinPolicy: GroupJoinPolicy };

export type ResolveAvailableActionInput = {
  group: PortalActionGroup;
  /** The member's row for this group in any status, or null. `active` rows never reach this function. */
  row: PortalActionRow | null;
  category: PortalActionCategory;
  /** The member's active groups in the same category (never includes `group`). */
  myActiveInCategory: readonly PortalActiveGroup[];
};

/**
 * What the portal offers on a group the member is not (yet) in. `null` means
 * the group is omitted from the page entirely.
 *
 * The existing row always wins: a pending or declined request is shown as such
 * even when the group has since become `admin_only` or the category has hidden
 * its groups — the member asked, so they get to see what happened. What they
 * may do next is then judged against the *current* rules: a declined member
 * can only "request again" if a fresh request would be offered today.
 */
export function resolveAvailableAction(
  input: ResolveAvailableActionInput,
): PortalAvailableAction | null {
  const { row } = input;

  if (row?.status === "pending") {
    return { kind: "pending", requestedAt: row.requestedAt ?? new Date(0) };
  }

  if (row?.status === "declined") {
    const fresh = resolveFreshAction(input);
    return {
      kind: "declined",
      decidedAt: row.decidedAt ?? new Date(0),
      reason: row.declineReason,
      canRequestAgain: !row.requestsBlocked && fresh?.kind === "request",
    };
  }

  return resolveFreshAction(input);
}

/** The offer for someone with no live request on the group. */
function resolveFreshAction({
  group,
  category,
  myActiveInCategory,
}: ResolveAvailableActionInput): PortalAvailableAction | null {
  if (group.joinPolicy === "admin_only") {
    return category.showGroupsToNonMembers ? { kind: "ask_leader" } : null;
  }

  if (category.selectionMode === "single" && myActiveInCategory.length > 0) {
    const current = myActiveInCategory[0];

    if (group.joinPolicy === "request_to_join") {
      // Approving would put them in two groups of a single-select category.
      return {
        kind: "blocked",
        reason: current.joinPolicy === "free_join_leave" ? "leave_current_first" : "ask_leader_to_switch",
      };
    }

    if (current.joinPolicy === "free_join_leave") {
      return { kind: "switch", from: { id: current.id, name: current.name } };
    }

    return { kind: "blocked", reason: "ask_leader_to_switch" };
  }

  if (
    category.selectionMode === "multiple" &&
    category.maxSelections !== null &&
    myActiveInCategory.length >= category.maxSelections
  ) {
    return { kind: "blocked", reason: "max_selections_reached" };
  }

  return group.joinPolicy === "free_join_leave" ? { kind: "join" } : { kind: "request" };
}

/**
 * Whether the member may leave a group they are active in. Only
 * `free_join_leave` groups can be left, and not when the category insists on
 * one group and this is the member's only one there.
 */
export function resolveLeave(
  group: PortalActionGroup,
  category: Pick<PortalActionCategory, "selectionRequired">,
  myActiveInCategory: readonly PortalActiveGroup[],
): { canLeave: boolean; reason: PortalLeaveBlockedReason | null } {
  if (group.joinPolicy !== "free_join_leave") {
    return { canLeave: false, reason: "policy" };
  }

  const othersInCategory = myActiveInCategory.filter((entry) => entry.id !== group.id);

  if (category.selectionRequired && othersInCategory.length === 0) {
    return { canLeave: false, reason: "selection_required" };
  }

  return { canLeave: true, reason: null };
}

// ─── Group page access ──────────────────────────────────────────────────────

export type GroupPageVisibilityGroup = {
  isActive: boolean;
  pageVisibility: GroupPageVisibility;
};

export type GroupPageVisibilityCategory = {
  isActive: boolean;
  groupPagesVisibleToAllMembers: boolean;
};

export type GroupPageAccessInput = {
  /** The viewer's row for this group in any status, or null. */
  rowStatus: GroupMembershipStatus | null;
  group: GroupPageVisibilityGroup;
  category: GroupPageVisibilityCategory;
};

export type EffectiveGroupPageVisibility = Exclude<GroupPageVisibility, "inherit">;

export type GroupPageAccessLevel = "member" | "visitor";

export type GroupPageAccess = {
  /** `null` means the page does not exist for this viewer — the route 404s, never 403s. */
  level: GroupPageAccessLevel | null;
  effectiveVisibility: EffectiveGroupPageVisibility;
};

/** The group's `pageVisibility` unless `inherit`, then the category flag. */
export function resolveEffectiveVisibility(
  group: Pick<GroupPageVisibilityGroup, "pageVisibility">,
  category: Pick<GroupPageVisibilityCategory, "groupPagesVisibleToAllMembers">,
): EffectiveGroupPageVisibility {
  if (group.pageVisibility !== "inherit") return group.pageVisibility;
  return category.groupPagesVisibleToAllMembers ? "all_members" : "members_only";
}

/**
 * Who the viewer is on a group's portal page.
 *
 * Only an `active` row is a member; `pending` and `declined` rows are visitors
 * like anyone else, so a members-only page stays invisible to someone whose
 * request was turned down. An inactive group or category has no page at all,
 * even for its members — the card is not shown either.
 */
export function resolveGroupPageAccess(input: GroupPageAccessInput): GroupPageAccess {
  const effectiveVisibility = resolveEffectiveVisibility(input.group, input.category);

  if (!input.group.isActive || !input.category.isActive) {
    return { level: null, effectiveVisibility };
  }

  if (input.rowStatus === "active") {
    return { level: "member", effectiveVisibility };
  }

  if (effectiveVisibility === "all_members") {
    return { level: "visitor", effectiveVisibility };
  }

  return { level: null, effectiveVisibility };
}
