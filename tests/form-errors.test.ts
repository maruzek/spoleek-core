import { describe, expect, it } from "vitest";

import { flattenSchemaErrors } from "@/lib/form-errors";
import { groupCategorySchema } from "@/lib/groups";

describe("flattenSchemaErrors", () => {
  it("puts a superRefine rule under the field it names", () => {
    const parsed = groupCategorySchema.safeParse({
      name: "Regions",
      slug: "regions",
      showInRegistration: true,
      registrationFieldLabel: null,
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const errors = flattenSchemaErrors<"registrationFieldLabel">(parsed.error);
    expect(errors.registrationFieldLabel).toEqual([
      "Add the singular label applicants should see on the join form.",
    ]);
  });

  it("keeps every message for a field", () => {
    const parsed = groupCategorySchema.safeParse({
      name: "R",
      slug: "regions",
      selectionMode: "single",
      maxSelections: 3,
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const errors = flattenSchemaErrors<"name" | "maxSelections">(parsed.error);
    expect(errors.name).toEqual(["Name is required."]);
    expect(errors.maxSelections).toEqual([
      "Single-selection categories can allow at most one group.",
    ]);
  });
});
