import { describe, expect, it } from "vitest";

import { memberCustomFieldSchema } from "@/lib/member-custom-fields";

/**
 * Sensitivity is an accountability record, not an access control — it answers
 * whether the organization may hold the data at all. Art. 9(1) is a
 * prohibition; only a condition in Art. 9(2) lifts it, and no visibility
 * setting does.
 */
const base = {
  key: "allergies",
  label: "Allergies",
  type: "text" as const,
  stage: "admin_only" as const,
  discoveryMode: "available" as const,
  required: false,
  isActive: true,
  isDateOfBirth: false,
  sortOrder: 0,
  options: [],
  constraints: {},
  valueVisibility: "org_admins" as const,
};

function parse(overrides: Record<string, unknown>) {
  return memberCustomFieldSchema.safeParse({ ...base, ...overrides });
}

function messagesOn(result: ReturnType<typeof parse>, path: string) {
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path.join(".") === path)
    .map((issue) => issue.message);
}

describe("an ordinary field", () => {
  it("needs no condition or purpose", () => {
    expect(parse({ sensitivity: "normal" }).success).toBe(true);
  });

  it("cannot carry an Article 9 condition it does not need", () => {
    const result = parse({
      sensitivity: "normal",
      art9Condition: "not_for_profit_body",
    });

    expect(messagesOn(result, "art9Condition")).toHaveLength(1);
  });
});

describe("a special-category field", () => {
  it("is refused without a condition and a purpose", () => {
    const result = parse({ sensitivity: "special_category" });

    expect(messagesOn(result, "art9Condition")).toHaveLength(1);
    expect(messagesOn(result, "processingPurpose")).toHaveLength(1);
  });

  it("is refused with a purpose too thin to answer anybody with", () => {
    const result = parse({
      sensitivity: "special_category",
      art9Condition: "not_for_profit_body",
      processingPurpose: "stuff",
    });

    expect(messagesOn(result, "processingPurpose")).toHaveLength(1);
  });

  it("is accepted with both", () => {
    const result = parse({
      sensitivity: "special_category",
      art9Condition: "not_for_profit_body",
      processingPurpose: "Catering and medical safety at organization events.",
    });

    expect(result.success).toBe(true);
  });
});

describe("the explicit-consent guard", () => {
  const consentField = {
    sensitivity: "special_category" as const,
    art9Condition: "explicit_consent" as const,
    processingPurpose: "Catering and medical safety at organization events.",
  };

  it("refuses to put a consent-based field in front of members", () => {
    // Art. 9(2)(a) needs explicit consent to a specified purpose. Spoleek
    // cannot capture that per field yet, and the registration checkbox is not
    // it — so a member-facing field here would collect Art. 9 data with no
    // valid condition behind it.
    for (const stage of ["registration", "post_approval", "optional"] as const) {
      const result = parse({ ...consentField, stage });

      expect(messagesOn(result, "stage")).toHaveLength(1);
    }
  });

  it("allows admin-only, where consent was taken elsewhere", () => {
    const result = parse({ ...consentField, stage: "admin_only" });

    expect(result.success).toBe(true);
  });

  it("does not block conditions that need no per-field consent", () => {
    const result = parse({
      sensitivity: "special_category",
      art9Condition: "not_for_profit_body",
      processingPurpose: "Catering and medical safety at organization events.",
      stage: "registration",
    });

    expect(result.success).toBe(true);
  });
});
