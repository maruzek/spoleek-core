import type { GroupJoinPolicy } from "@/server/db/schema";

/**
 * Plain-language reading of a category's membership rules, for lists and
 * summaries. The form still shows the raw switches; this is how an admin
 * scanning the structure page reads them without decoding "single / Required /
 * Max 3" in their head.
 */
export type CategoryRuleInput = {
  selectionMode: "single" | "multiple";
  selectionRequired: boolean;
  maxSelections: number | null;
  defaultJoinPolicy: GroupJoinPolicy;
};

export function describeCategoryMembership(rule: CategoryRuleInput): string {
  if (rule.selectionMode === "single") {
    return rule.selectionRequired
      ? "Every member belongs to exactly one group."
      : "A member belongs to at most one group.";
  }

  const cap = rule.maxSelections && rule.maxSelections > 1 ? rule.maxSelections : null;

  if (rule.selectionRequired) {
    return cap
      ? `Every member joins at least one group, up to ${cap}.`
      : "Every member joins at least one group.";
  }

  return cap ? `Members may join up to ${cap} groups.` : "Members may join any number of groups.";
}

/** Who moves members in and out, as a short second sentence. */
export function describeJoinPolicy(policy: GroupJoinPolicy): string {
  switch (policy) {
    case "admin_only":
      return "Managers place members.";
    case "free_join_leave":
      return "Members join and leave freely.";
    case "request_to_join":
      return "Members request to join.";
  }
}
