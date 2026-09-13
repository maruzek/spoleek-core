import { describe, expect, it } from "vitest";

import {
  isMemberEligible,
  resolveEligibleMemberIds,
  type AudienceRule,
} from "@/lib/events/eligibility";

/**
 * Fixture org: category "scouts" holds groups g1 and g2; category "parents"
 * holds g3. Members m1..m6; m5 is inactive.
 */
const groupsByCategory = new Map<string, string>([
  ["g1", "scouts"],
  ["g2", "scouts"],
  ["g3", "parents"],
]);

const groupMemberships = [
  { groupId: "g1", memberId: "m1" },
  { groupId: "g1", memberId: "m2" },
  { groupId: "g2", memberId: "m3" },
  { groupId: "g2", memberId: "m5" }, // inactive
  { groupId: "g3", memberId: "m4" },
];

const activeMemberIds = new Set(["m1", "m2", "m3", "m4", "m6"]);

const rule = (partial: Partial<AudienceRule> & Pick<AudienceRule, "kind">): AudienceRule => ({
  groupId: null,
  categoryId: null,
  memberId: null,
  ...partial,
});

const resolve = (rules: AudienceRule[]) =>
  [...resolveEligibleMemberIds({ rules, groupMemberships, groupsByCategory, activeMemberIds })].sort();

describe("resolveEligibleMemberIds", () => {
  it("is empty with no rules", () => {
    expect(resolve([])).toEqual([]);
  });

  it("expands a group rule to its active members", () => {
    expect(resolve([rule({ kind: "group", groupId: "g1" })])).toEqual(["m1", "m2"]);
  });

  it("expands a category rule to every group in it", () => {
    expect(resolve([rule({ kind: "category", categoryId: "scouts" })])).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
  });

  it("excludes inactive members reached through a group", () => {
    expect(resolve([rule({ kind: "group", groupId: "g2" })])).toEqual(["m3"]);
  });

  it("includes an explicitly named member even without a group", () => {
    expect(resolve([rule({ kind: "member", memberId: "m6" })])).toEqual(["m6"]);
  });

  it("filters an explicitly named inactive member", () => {
    // Eligible always implies active; alumni go in as external invitees.
    expect(resolve([rule({ kind: "member", memberId: "m5" })])).toEqual([]);
  });

  it("unions rules without duplicates", () => {
    expect(
      resolve([
        rule({ kind: "group", groupId: "g1" }),
        rule({ kind: "category", categoryId: "scouts" }),
        rule({ kind: "member", memberId: "m1" }),
        rule({ kind: "member", memberId: "m4" }),
      ]),
    ).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("ignores external rules and rules pointing at unknown ids", () => {
    expect(
      resolve([
        rule({ kind: "external" }),
        rule({ kind: "group", groupId: "nope" }),
        rule({ kind: "category", categoryId: "nope" }),
      ]),
    ).toEqual([]);
  });
});

describe("isMemberEligible", () => {
  it("answers for one member", () => {
    const params = {
      rules: [rule({ kind: "category", categoryId: "parents" })],
      groupMemberships,
      groupsByCategory,
      activeMemberIds,
    };
    expect(isMemberEligible("m4", params)).toBe(true);
    expect(isMemberEligible("m1", params)).toBe(false);
  });
});
