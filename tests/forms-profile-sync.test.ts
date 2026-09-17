import { describe, expect, it } from "vitest";

import {
  resolveProfileWrites,
  validateQuestionLink,
  type SyncQuestion,
} from "@/lib/forms/profile-sync";
import type { CustomFieldValue } from "@/server/db/schema";

const q = (overrides: Partial<SyncQuestion> & Pick<SyncQuestion, "id">): SyncQuestion => ({
  kind: "input",
  memberFieldId: "f1",
  profileSync: "offer",
  sensitivity: "normal",
  ...overrides,
});

const values = (entries: Record<string, CustomFieldValue>) =>
  new Map(Object.entries(entries));

const resolve = (
  questions: SyncQuestion[],
  vals: Record<string, CustomFieldValue>,
  syncFlags: Record<string, boolean> = {},
  identityKind: "member" | "token" | "guest" = "member",
) => resolveProfileWrites({ questions, values: values(vals), syncFlags, identityKind });

describe("resolveProfileWrites", () => {
  it("never writes: none", () => {
    expect(resolve([q({ id: "a", profileSync: "none" })], { a: "x" }, { a: true })).toEqual([]);
  });

  it("writes only when ticked: offer and offer_checked", () => {
    for (const profileSync of ["offer", "offer_checked"] as const) {
      const qs = [q({ id: "a", profileSync })];
      expect(resolve(qs, { a: "x" }, { a: true })).toEqual([{ fieldId: "f1", value: "x" }]);
      expect(resolve(qs, { a: "x" }, { a: false })).toEqual([]);
      // Omitted flag = unticked, whatever the default in the UI was.
      expect(resolve(qs, { a: "x" }, {})).toEqual([]);
    }
  });

  it("always writes regardless of the flag: always", () => {
    const qs = [q({ id: "a", profileSync: "always" })];
    expect(resolve(qs, { a: 5 }, { a: false })).toEqual([{ fieldId: "f1", value: 5 }]);
  });

  it("does not clear the profile with an empty answer", () => {
    expect(resolve([q({ id: "a", profileSync: "always" })], { a: null })).toEqual([]);
    expect(resolve([q({ id: "a", profileSync: "always" })], {})).toEqual([]);
  });

  it("writes nothing for token and guest identities", () => {
    const qs = [q({ id: "a", profileSync: "always" })];
    expect(resolve(qs, { a: "x" }, {}, "token")).toEqual([]);
    expect(resolve(qs, { a: "x" }, {}, "guest")).toEqual([]);
  });

  it("skips unlinked, sectional and special-category questions", () => {
    const qs = [
      q({ id: "a", profileSync: "always", memberFieldId: null }),
      q({ id: "b", profileSync: "always", kind: "section" }),
      q({ id: "c", profileSync: "always", sensitivity: "special_category" }),
    ];
    expect(resolve(qs, { a: "x", b: "y", c: "z" })).toEqual([]);
  });

  it("keeps the question order", () => {
    const qs = [
      q({ id: "a", profileSync: "always", memberFieldId: "f1" }),
      q({ id: "b", profileSync: "always", memberFieldId: "f2" }),
    ];
    expect(resolve(qs, { b: false, a: ["x"] })).toEqual([
      { fieldId: "f1", value: ["x"] },
      { fieldId: "f2", value: false },
    ]);
  });
});

describe("validateQuestionLink", () => {
  const field = { type: "text" as const, stage: "optional" as const, isActive: true };

  it("accepts a normal question on an active, member-facing field", () => {
    expect(validateQuestionLink({ sensitivity: "normal", type: null }, field)).toBeNull();
    expect(validateQuestionLink({ sensitivity: "normal", type: "text" }, field)).toBeNull();
  });

  it("refuses special-category questions before looking at the field", () => {
    expect(validateQuestionLink({ sensitivity: "special_category", type: null }, null)).toBe(
      "special_category",
    );
  });

  it("refuses a missing, inactive or admin-only field", () => {
    expect(validateQuestionLink({ sensitivity: "normal", type: null }, null)).toBe(
      "field_not_found",
    );
    expect(
      validateQuestionLink({ sensitivity: "normal", type: null }, { ...field, isActive: false }),
    ).toBe("field_inactive");
    expect(
      validateQuestionLink({ sensitivity: "normal", type: null }, { ...field, stage: "admin_only" }),
    ).toBe("admin_only");
  });

  it("refuses a type that no longer matches the field", () => {
    expect(validateQuestionLink({ sensitivity: "normal", type: "number" }, field)).toBe(
      "type_mismatch",
    );
  });
});
