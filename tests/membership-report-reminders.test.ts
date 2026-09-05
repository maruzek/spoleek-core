import { describe, expect, it } from "vitest";

import { getDueStage } from "@/server/lib/membership-report-reminders";

/**
 * The ladder is the one piece of this module a cron runs unattended against
 * every group, every morning. Its failure modes are both silent: mailing the
 * same rung repeatedly, or never mailing a rung at all.
 */
const NOW = new Date("2026-03-20T06:00:00Z");

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000);
}

describe("getDueStage", () => {
  it("says nothing before the first rung is in range", () => {
    expect(
      getDueStage({ daysLeft: 15, lastStage: null, lastSentAt: null, now: NOW }),
    ).toBeNull();
  });

  it.each([
    { daysLeft: 14, expected: "t_minus_14" },
    { daysLeft: 7, expected: "t_minus_7" },
    { daysLeft: 1, expected: "t_minus_1" },
  ])(
    "fires $expected exactly on its threshold at $daysLeft days out",
    ({ daysLeft, expected }) => {
      expect(
        getDueStage({ daysLeft, lastStage: null, lastSentAt: null, now: NOW }),
      ).toBe(expected);
    },
  );

  it("does not repeat a rung that has already been sent", () => {
    expect(
      getDueStage({
        daysLeft: 12,
        lastStage: "t_minus_14",
        lastSentAt: daysAgo(2),
        now: NOW,
      }),
    ).toBeNull();
  });

  it("catches up a skipped rung rather than passing over it", () => {
    // The group became eligible late — at 9 days out, nothing has been sent.
    // It is owed the 14-day rung: the point is that it has been told once.
    expect(
      getDueStage({ daysLeft: 9, lastStage: null, lastSentAt: null, now: NOW }),
    ).toBe("t_minus_14");
  });

  it("climbs one rung at a time even when several are overdue", () => {
    expect(
      getDueStage({
        daysLeft: 2,
        lastStage: "t_minus_14",
        lastSentAt: daysAgo(1),
        now: NOW,
      }),
    ).toBe("t_minus_7");
  });

  it("never goes back down the ladder", () => {
    // A deadline pushed further out must not re-send an earlier rung.
    expect(
      getDueStage({
        daysLeft: 13,
        lastStage: "t_minus_1",
        lastSentAt: daysAgo(3),
        now: NOW,
      }),
    ).toBeNull();
  });

  it("goes overdue the first day past the deadline", () => {
    expect(
      getDueStage({
        daysLeft: -1,
        lastStage: "t_minus_1",
        lastSentAt: daysAgo(1),
        now: NOW,
      }),
    ).toBe("overdue");
  });

  it("goes overdue even when no rung was ever sent", () => {
    expect(
      getDueStage({ daysLeft: -5, lastStage: null, lastSentAt: null, now: NOW }),
    ).toBe("overdue");
  });

  it("holds the overdue nudge until the repeat window is up", () => {
    for (const days of [0, 1, 6]) {
      expect(
        getDueStage({
          daysLeft: -10,
          lastStage: "overdue",
          lastSentAt: daysAgo(days),
          now: NOW,
        }),
      ).toBeNull();
    }
  });

  it("repeats the overdue nudge every seven days", () => {
    for (const days of [7, 8, 30]) {
      expect(
        getDueStage({
          daysLeft: -10,
          lastStage: "overdue",
          lastSentAt: daysAgo(days),
          now: NOW,
        }),
      ).toBe("overdue");
    }
  });

  it("sends overdue when the stage says overdue but the timestamp is missing", () => {
    // Hand-edited or half-written rows must not silence the chase forever.
    expect(
      getDueStage({
        daysLeft: -3,
        lastStage: "overdue",
        lastSentAt: null,
        now: NOW,
      }),
    ).toBe("overdue");
  });

  it("treats the deadline day itself as still in time", () => {
    expect(
      getDueStage({
        daysLeft: 0,
        lastStage: "t_minus_1",
        lastSentAt: daysAgo(1),
        now: NOW,
      }),
    ).toBeNull();
  });

  it("starts at the most urgent rung already reached, not the first one", () => {
    // Nothing has been sent and the deadline is today. The catch-up is not a
    // replay of the whole ladder — it opens at the rung the calendar is at.
    expect(
      getDueStage({ daysLeft: 0, lastStage: null, lastSentAt: null, now: NOW }),
    ).toBe("t_minus_1");
  });
});
