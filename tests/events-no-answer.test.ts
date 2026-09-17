import { describe, expect, it } from "vitest";

import { countNoAnswer } from "@/lib/events/no-answer";

/**
 * "No answer" must count the same people "Invited" counts. The old source —
 * the email recipient list — silently dropped members without an email and
 * folded members sharing one, so an org with 41 eligible members and no
 * responses showed "Invited 41 · No answer 36".
 */
describe("countNoAnswer", () => {
  it("counts every eligible member with no response, regardless of email", () => {
    const eligible = new Set(["a", "b", "c", "d"]);
    expect(countNoAnswer({ eligibleMemberIds: eligible, externalEmails: [], responses: [] })).toBe(4);
  });

  it("drops members who answered, whatever they answered", () => {
    const eligible = new Set(["a", "b", "c"]);
    const responses = [
      { memberId: "a", guestEmail: null },
      { memberId: "b", guestEmail: null },
    ];
    expect(countNoAnswer({ eligibleMemberIds: eligible, externalEmails: [], responses })).toBe(1);
  });

  it("ignores responses from people outside the audience", () => {
    const eligible = new Set(["a"]);
    const responses = [{ memberId: "stranger", guestEmail: null }];
    expect(countNoAnswer({ eligibleMemberIds: eligible, externalEmails: [], responses })).toBe(1);
  });

  it("counts externals until they answer via their guest email", () => {
    const eligible = new Set(["a"]);
    const externals = ["x@example.com", "y@example.com"];
    const responses = [{ memberId: null, guestEmail: "X@Example.com " }];
    expect(countNoAnswer({ eligibleMemberIds: eligible, externalEmails: externals, responses })).toBe(2);
  });
});
