import { describe, expect, it } from "vitest";

import {
  getFeeDueDate,
  resolveConfirmDueDate,
  resolveMembershipPeriod,
} from "@/lib/membership-period";
import { daysUntil } from "@/lib/membership-report-status";

/**
 * These are the bugs that come back. A period bound is a calendar date living
 * in a Postgres `date` column, so any local-time construction shifts it a day
 * for half the world — and the shift is invisible until a year starts or ends
 * on the wrong date.
 */
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

describe("resolveMembershipPeriod", () => {
  it("runs 1 January to 31 December of the year", () => {
    const period = resolveMembershipPeriod({
      mode: "calendar_year",
      renewalMonth: 1,
      renewalDay: 1,
      today: new Date("2026-06-15T12:00:00Z"),
    });

    expect(period.label).toBe("2026");
    expect(isoDate(period.start)).toBe("2026-01-01");
    expect(isoDate(period.end)).toBe("2026-12-31");
  });

  it("ignores the renewal month and day in calendar_year mode", () => {
    const period = resolveMembershipPeriod({
      mode: "calendar_year",
      renewalMonth: 9,
      renewalDay: 1,
      today: new Date("2026-06-15T12:00:00Z"),
    });

    expect(isoDate(period.start)).toBe("2026-01-01");
  });

  it("keeps the bounds on the year's own dates, not the day before", () => {
    // The original failure: `new Date(2026, 0, 1)` is midnight local, which
    // east of Greenwich persists to a `date` column as 2025-12-31.
    const period = resolveMembershipPeriod({
      mode: "calendar_year",
      renewalMonth: null,
      renewalDay: null,
      today: new Date("2026-01-01T00:00:00Z"),
    });

    expect(period.start.getUTCDate()).toBe(1);
    expect(period.start.getUTCMonth()).toBe(0);
    expect(period.end.getUTCDate()).toBe(31);
    expect(period.end.getUTCMonth()).toBe(11);
  });

  it.each([
    "2026-01-01T00:30:00Z",
    "2026-12-31T23:30:00Z",
    "2026-06-15T12:00:00Z",
  ])("names the period for the UTC year at %s", (instant) => {
    // The instants either side of midnight on New Year are the ones that pick
    // the wrong year when the year is read in local time. Whichever timezone
    // the server happens to run in, the label has to match the bounds.
    const period = resolveMembershipPeriod({
      mode: "calendar_year",
      renewalMonth: null,
      renewalDay: null,
      today: new Date(instant),
    });

    expect(period.label).toBe("2026");
    expect(isoDate(period.start).slice(0, 4)).toBe(period.label);
  });
});

describe("resolveConfirmDueDate", () => {
  const period = resolveMembershipPeriod({
    mode: "calendar_year",
    renewalMonth: null,
    renewalDay: null,
    today: new Date("2026-06-15T12:00:00Z"),
  });

  it("returns null when no deadline is configured", () => {
    expect(resolveConfirmDueDate({ period, month: null, day: 31 })).toBeNull();
    expect(resolveConfirmDueDate({ period, month: 3, day: null })).toBeNull();
  });

  it("builds the date in the period's own year", () => {
    const due = resolveConfirmDueDate({ period, month: 3, day: 31 });
    expect(isoDate(due!)).toBe("2026-03-31");
  });

  it("stays on the period's year even when resolved in a later one", () => {
    // Reopening the 2026 report in 2027 must still show the 2026 deadline.
    const due = resolveConfirmDueDate({ period, month: 1, day: 15 });
    expect(due!.getUTCFullYear()).toBe(2026);
  });
});

describe("getFeeDueDate", () => {
  it("adds the payment window in whole UTC days", () => {
    const due = getFeeDueDate(new Date("2026-01-01T00:00:00Z"), 30);
    expect(isoDate(due)).toBe("2026-01-31");
  });

  it("crosses a month boundary without drifting", () => {
    const due = getFeeDueDate(new Date("2026-02-20T00:00:00Z"), 14);
    expect(isoDate(due)).toBe("2026-03-06");
  });
});

describe("daysUntil", () => {
  it("counts whole days to a future deadline", () => {
    expect(
      daysUntil(new Date("2026-03-31T00:00:00Z"), new Date("2026-03-24T09:00:00Z")),
    ).toBe(7);
  });

  it("is zero on the deadline day itself, whatever the time", () => {
    expect(
      daysUntil(new Date("2026-03-31T00:00:00Z"), new Date("2026-03-31T23:59:00Z")),
    ).toBe(0);
  });

  it("goes negative once the deadline has passed", () => {
    expect(
      daysUntil(new Date("2026-03-31T00:00:00Z"), new Date("2026-04-03T01:00:00Z")),
    ).toBe(-3);
  });
});
