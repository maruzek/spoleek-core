import { describe, expect, it } from "vitest";

import { resolveSelectionViolation } from "@/lib/groups/selection-limit";

describe("resolveSelectionViolation", () => {
  it("single: any other active row is one too many", () => {
    const category = { selectionMode: "single" as const, maxSelections: null };
    expect(resolveSelectionViolation(category, 0)).toBeNull();
    expect(resolveSelectionViolation(category, 1)).toBe("SINGLE_SELECT_TAKEN");
  });

  it("single ignores maxSelections, as the portal decision table does", () => {
    expect(
      resolveSelectionViolation({ selectionMode: "single", maxSelections: 3 }, 1),
    ).toBe("SINGLE_SELECT_TAKEN");
  });

  it("multiple: unlimited without maxSelections, capped with it", () => {
    expect(
      resolveSelectionViolation({ selectionMode: "multiple", maxSelections: null }, 40),
    ).toBeNull();
    expect(
      resolveSelectionViolation({ selectionMode: "multiple", maxSelections: 2 }, 1),
    ).toBeNull();
    expect(
      resolveSelectionViolation({ selectionMode: "multiple", maxSelections: 2 }, 2),
    ).toBe("MAX_SELECTIONS_REACHED");
  });
});
