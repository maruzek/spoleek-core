import { describe, expect, it } from "vitest";

import { formQuestionSchema, formSettingsSchema } from "@/lib/forms/schemas";

const FIELD = "11111111-1111-4111-8111-111111111111";

const input = (overrides: Record<string, unknown> = {}) => ({
  kind: "input",
  label: "Diet",
  type: "text",
  ...overrides,
});

const paths = (value: unknown) => {
  const result = formQuestionSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
};

describe("formQuestionSchema", () => {
  it("accepts a plain input and a section", () => {
    expect(paths(input())).toEqual([]);
    expect(paths({ kind: "section", label: "Transport" })).toEqual([]);
  });

  it("requires a link for profile sync", () => {
    expect(paths(input({ profileSync: "always" }))).toEqual(["profileSync"]);
    expect(paths(input({ profileSync: "always", memberFieldId: FIELD }))).toEqual([]);
  });

  it("forces the privacy coupling on special-category questions", () => {
    expect(paths(input({ sensitivity: "special_category", memberFieldId: FIELD }))).toEqual([
      "art9Condition",
      "processingPurpose",
      "memberFieldId",
      "shredAfterEventDays",
    ]);
    expect(
      paths(
        input({
          sensitivity: "special_category",
          art9Condition: "health_care",
          processingPurpose: "Allergies for the camp kitchen.",
          shredAfterEventDays: 14,
        }),
      ),
    ).toEqual([]);
  });

  it("rejects an Art. 9 condition on a normal question", () => {
    expect(paths(input({ art9Condition: "health_care" }))).toEqual(["art9Condition"]);
  });

  it("needs options for selects unless linked", () => {
    expect(paths(input({ type: "select" }))).toEqual(["options"]);
    expect(paths(input({ type: "select", memberFieldId: FIELD }))).toEqual([]);
    expect(paths(input({ type: "text", options: ["a"] }))).toEqual(["options"]);
  });

  it("checks constraint ranges", () => {
    expect(paths(input({ type: "number", constraints: { min: 5, max: 1 } }))).toEqual([
      "constraints",
    ]);
  });
});

describe("formSettingsSchema", () => {
  it("needs the id matching the owner type", () => {
    const base = { title: "Camp", ownerType: "group" };
    expect(formSettingsSchema.safeParse(base).success).toBe(false);
    expect(formSettingsSchema.safeParse({ ...base, ownerGroupId: FIELD }).success).toBe(true);
  });
});
