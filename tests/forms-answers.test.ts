import { describe, expect, it } from "vitest";

import { readAnswer, sealAnswer } from "@/server/lib/forms/answers";

// `tests/setup.ts` provides APP_ENCRYPTION_KEY, so the module seals for real.

const normal = { sensitivity: "normal", valueVisibility: "member_managers" } as const;
const sensitive = { sensitivity: "special_category", valueVisibility: "member_managers" } as const;
const adminsOnly = { sensitivity: "normal", valueVisibility: "org_admins" } as const;

describe("sealAnswer", () => {
  it("stores normal answers as plaintext", () => {
    expect(sealAnswer(normal, ["a", "b"])).toEqual({ value: ["a", "b"], encryptedValue: null });
  });

  it("stores special-category answers only in the envelope", () => {
    const sealed = sealAnswer(sensitive, "peanuts");
    expect(sealed.value).toBeNull();
    expect(sealed.encryptedValue).toBeTypeOf("string");
    expect(sealed.encryptedValue).not.toContain("peanuts");
  });
});

describe("readAnswer", () => {
  it("round-trips every value shape through the envelope", () => {
    for (const value of ["text", 42, true, ["x", "y"], null]) {
      const sealed = sealAnswer(sensitive, value);
      expect(readAnswer(sensitive, sealed, "full")).toEqual(
        value === null ? { kind: "empty" } : { kind: "value", value },
      );
    }
  });

  it("returns plaintext for normal questions", () => {
    expect(readAnswer(normal, sealAnswer(normal, 7), "scoped")).toEqual({ kind: "value", value: 7 });
  });

  it("withholds from a viewer below the rung, without saying nothing is there", () => {
    expect(readAnswer(adminsOnly, sealAnswer(adminsOnly, "x"), "scoped")).toEqual({
      kind: "withheld",
    });
    expect(readAnswer(adminsOnly, sealAnswer(adminsOnly, "x"), "full")).toEqual({
      kind: "value",
      value: "x",
    });
  });

  it("reports empty rather than withheld when there is no answer", () => {
    expect(readAnswer(adminsOnly, null, "scoped")).toEqual({ kind: "empty" });
    expect(readAnswer(adminsOnly, { value: null, encryptedValue: null }, "scoped")).toEqual({
      kind: "empty",
    });
  });

  it("always opens for the submitter", () => {
    const locked = { ...sensitive, valueVisibility: "org_admins" } as const;
    const sealed = sealAnswer(locked, "gluten");
    expect(readAnswer(locked, sealed, "self")).toEqual({
      kind: "value",
      value: "gluten",
    });
  });

  it("treats a shredded row as empty", () => {
    expect(readAnswer(sensitive, { value: null, encryptedValue: null }, "full")).toEqual({
      kind: "empty",
    });
  });
});
