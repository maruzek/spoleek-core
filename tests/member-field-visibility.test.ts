import { describe, expect, it } from "vitest";

import {
  canReadFieldValue,
  partitionFieldsByVisibility,
  redactAnswerMap,
} from "@/server/lib/member-field-visibility";
import type { MemberCustomField } from "@/server/db/schema";

/**
 * Visibility is a property of every field, so the rules have to hold for the
 * ordinary ones as much as the sensitive ones.
 */
function field(
  key: string,
  valueVisibility: MemberCustomField["valueVisibility"],
): Pick<MemberCustomField, "id" | "key" | "label" | "valueVisibility"> {
  return { id: `id-${key}`, key, label: key, valueVisibility };
}

const phone = field("phone", "member_managers");
const allergies = field("allergies", "member_managers");
const notes = field("notes", "org_admins");

describe("who can read a field value", () => {
  it("lets org admins read everything", () => {
    expect(canReadFieldValue(phone, "full")).toBe(true);
    expect(canReadFieldValue(notes, "full")).toBe(true);
  });

  it("keeps org-admin-only fields from scoped leaders", () => {
    expect(canReadFieldValue(phone, "scoped")).toBe(true);
    expect(canReadFieldValue(notes, "scoped")).toBe(false);
  });

  it("defaults the wider way, so adding the column changes nothing", () => {
    // A field created before visibility existed carries the default, and a
    // leader who could read it yesterday can still read it today.
    expect(canReadFieldValue(field("legacy", "member_managers"), "scoped")).toBe(true);
  });
});

describe("partitioning fields", () => {
  it("returns both halves rather than filtering", () => {
    const { readable, withheld } = partitionFieldsByVisibility(
      [phone, allergies, notes],
      "scoped",
    );

    expect(readable.map((f) => f.key)).toEqual(["phone", "allergies"]);
    // The caller needs this half to render "an answer exists" — dropping it is
    // how a hidden field becomes indistinguishable from an empty one.
    expect(withheld.map((f) => f.key)).toEqual(["notes"]);
  });

  it("withholds nothing from a full-access viewer", () => {
    const { withheld } = partitionFieldsByVisibility([phone, notes], "full");

    expect(withheld).toEqual([]);
  });
});

describe("redacting an answer map", () => {
  const answers = {
    phone: "+420123456789",
    allergies: "peanuts",
    notes: "a private administrative note",
  };

  it("removes withheld answers and reports what it removed", () => {
    const result = redactAnswerMap([phone, allergies, notes], answers, "scoped");

    expect(result.answers).toEqual({
      phone: "+420123456789",
      allergies: "peanuts",
    });
    expect(result.withheld).toEqual([
      expect.objectContaining({ key: "notes", hasWithheldAnswer: true }),
    ]);
  });

  it("distinguishes a withheld answer from a withheld blank", () => {
    const result = redactAnswerMap([notes], { notes: null }, "scoped");

    // Both are hidden, but only one of them is somebody's data. Reporting an
    // unanswered field as "answer recorded" would send an admin chasing
    // something that does not exist.
    expect(result.withheld[0]?.hasWithheldAnswer).toBe(false);
  });

  it("returns the map untouched for a full-access viewer", () => {
    const result = redactAnswerMap([phone, notes], answers, "full");

    expect(result.answers).toBe(answers);
    expect(result.withheld).toEqual([]);
  });

  it("keeps a withheld field out of the writable set", () => {
    // The bug this guards: an absent key normalizes to null on save, so
    // handing a scoped leader's form the full field list would clear every
    // answer that was withheld from them.
    const { readable } = partitionFieldsByVisibility(
      [phone, allergies, notes],
      "scoped",
    );

    expect(readable.some((f) => f.key === "notes")).toBe(false);
  });
});
