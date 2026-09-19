import type { GroupCategorySelectionMode } from "@/server/db/schema";

/**
 * The Group Category selection invariant, as a pure rule: "one active group per
 * single-select category, at most `maxSelections` per multi-select one".
 *
 * Enforced at the write seam (`upsertActiveMembership`) for every door that
 * creates a membership; the portal's `resolveAvailableAction` explains the same
 * rule to the member *before* they act.
 */
export type SelectionLimitCategory = {
  selectionMode: GroupCategorySelectionMode;
  maxSelections: number | null;
};

export type SelectionViolation = "SINGLE_SELECT_TAKEN" | "MAX_SELECTIONS_REACHED";

/**
 * Whether adding one more active membership to `category` would break the
 * invariant. `activeOtherCount` is the member's active rows in the category
 * *excluding* the group being written — re-activating or re-assigning the same
 * group never counts against itself.
 *
 * Returns the violation, or `null` when the write may proceed.
 */
export function resolveSelectionViolation(
  category: SelectionLimitCategory,
  activeOtherCount: number,
): SelectionViolation | null {
  if (category.selectionMode === "single") {
    return activeOtherCount > 0 ? "SINGLE_SELECT_TAKEN" : null;
  }

  if (category.maxSelections !== null && activeOtherCount >= category.maxSelections) {
    return "MAX_SELECTIONS_REACHED";
  }

  return null;
}
