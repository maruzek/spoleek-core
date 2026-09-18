import { describe, expect, it } from "vitest";

import {
  PAST_EVENTS_CAP,
  bucketGroupEvents,
  bucketGroupForms,
  memberSince,
  nextFeeRenewal,
} from "@/lib/groups/portal-group-page";

const NOW = new Date("2026-09-18T12:00:00Z");
const GROUP = "group-a";
const OTHER = "group-b";

function ev(
  id: string,
  ownerGroupId: string | null,
  startsAt: string | null,
  endsAt: string | null = null,
) {
  return {
    event: {
      id,
      ownerGroupId,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
    },
  };
}

const ids = (items: Array<{ event: { id: string } }>) => items.map((item) => item.event.id);

describe("bucketGroupEvents", () => {
  const viewer = {
    invited: [
      ev("owned-late", GROUP, "2026-10-05T18:00:00Z"),
      ev("invited-1", OTHER, "2026-09-25T18:00:00Z"),
      ev("not-invited", OTHER, "2026-09-26T18:00:00Z"),
    ],
    open: [
      ev("owned-soon", GROUP, "2026-09-20T18:00:00Z"),
      ev("owned-undated", GROUP, null),
      ev("org-open", null, "2026-09-21T18:00:00Z"),
    ],
    past: [
      ev("past-old", GROUP, "2026-01-10T18:00:00Z", "2026-01-10T20:00:00Z"),
      ev("past-new", GROUP, "2026-08-01T18:00:00Z", "2026-08-01T20:00:00Z"),
      ev("past-other", OTHER, "2026-08-02T18:00:00Z"),
    ],
  };
  const invitedEventIds = new Set(["invited-1", "owned-soon"]);

  it("splits owned from invited and sorts upcoming soonest first, undated last", () => {
    const result = bucketGroupEvents({
      groupId: GROUP,
      now: NOW,
      viewer,
      invitedEventIds,
      access: "member",
    });

    expect(ids(result.upcoming)).toEqual(["owned-soon", "owned-late", "owned-undated"]);
    expect(result.upcoming.every((item) => item.relation === "owned")).toBe(true);

    // an owned event in the audience set stays "owned", not "invited"
    expect(ids(result.alsoInvited)).toEqual(["invited-1"]);
    expect(result.alsoInvited[0].relation).toBe("invited");
  });

  it("sorts past newest first and does not cap", () => {
    const many = Array.from({ length: PAST_EVENTS_CAP + 5 }, (_, i) =>
      ev(`p${i}`, GROUP, `2025-01-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`),
    );
    const result = bucketGroupEvents({
      groupId: GROUP,
      now: NOW,
      viewer: { ...viewer, past: [...viewer.past, ...many] },
      invitedEventIds,
      access: "member",
    });

    expect(result.past).toHaveLength(2 + many.length);
    expect(ids(result.past).slice(0, 2)).toEqual(["past-new", "past-old"]);
    expect(ids(result.past)).not.toContain("past-other");
  });

  it("gives visitors no past events", () => {
    const result = bucketGroupEvents({
      groupId: GROUP,
      now: NOW,
      viewer,
      invitedEventIds,
      access: "visitor",
    });

    expect(result.past).toEqual([]);
    expect(ids(result.upcoming)).toEqual(["owned-soon", "owned-late", "owned-undated"]);
  });
});

describe("bucketGroupForms", () => {
  const form = (
    id: string,
    ownerGroupId: string | null,
    open: boolean,
    submittedAt: string | null,
    event: { id: string } | null = null,
  ) => ({
    form: { id, ownerGroupId },
    event,
    open: { open },
    submittedAt: submittedAt ? new Date(submittedAt) : null,
  });

  const items = [
    form("open-new", GROUP, true, null),
    form("open-done", GROUP, true, "2026-09-01T10:00:00Z"),
    form("closed-done", GROUP, false, "2026-08-01T10:00:00Z"),
    form("closed-untouched", GROUP, false, null),
    form("other-open", OTHER, true, null),
    form("event-attached", GROUP, true, null, { id: "ev" }),
  ];

  it("keeps standalone owned forms, split by open state", () => {
    const result = bucketGroupForms({ groupId: GROUP, items, access: "member" });

    expect(result.open.map((item) => item.form.id)).toEqual(["open-new", "open-done"]);
    expect(result.open.map((item) => item.submitted)).toEqual([false, true]);
    expect(result.past.map((item) => item.form.id)).toEqual(["closed-done"]);
  });

  it("gives visitors no past forms", () => {
    const result = bucketGroupForms({ groupId: GROUP, items, access: "visitor" });

    expect(result.open.map((item) => item.form.id)).toEqual(["open-new", "open-done"]);
    expect(result.past).toEqual([]);
  });
});

describe("nextFeeRenewal", () => {
  it("returns null without a renewal day", () => {
    expect(nextFeeRenewal({ feeRenewalMonth: null, feeRenewalDay: 1 }, NOW)).toBeNull();
    expect(nextFeeRenewal({ feeRenewalMonth: 1, feeRenewalDay: null }, NOW)).toBeNull();
  });

  it("uses this year's date when it is still ahead", () => {
    expect(nextFeeRenewal({ feeRenewalMonth: 10, feeRenewalDay: 1 }, NOW)).toEqual(
      new Date("2026-10-01T00:00:00Z"),
    );
  });

  it("rolls to next year when this year's date has passed", () => {
    expect(nextFeeRenewal({ feeRenewalMonth: 1, feeRenewalDay: 1 }, NOW)).toEqual(
      new Date("2027-01-01T00:00:00Z"),
    );
  });

  it("clamps the day to the month's length", () => {
    expect(nextFeeRenewal({ feeRenewalMonth: 2, feeRenewalDay: 31 }, NOW)).toEqual(
      new Date("2027-02-28T00:00:00Z"),
    );
  });
});

describe("memberSince", () => {
  const createdAt = new Date("2026-05-01T10:00:00Z");
  const decidedAt = new Date("2026-05-08T10:00:00Z");

  it("prefers decidedAt", () => {
    expect(memberSince({ decidedAt, createdAt })).toEqual(decidedAt);
  });

  it("falls back to createdAt for admin-assigned rows", () => {
    expect(memberSince({ decidedAt: null, createdAt })).toEqual(createdAt);
  });
});
