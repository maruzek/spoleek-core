import { describe, expect, it } from "vitest";

import {
  daysUntil,
  groupByDay,
  nextRenewalDate,
  rankAttention,
  sortUpcoming,
  type AttentionItem,
} from "@/lib/dashboard";

function item(overrides: Partial<AttentionItem> & Pick<AttentionItem, "id" | "tone">): AttentionItem {
  return {
    module: "members",
    count: 1,
    title: overrides.id,
    detail: "",
    href: "/admin",
    waitingSince: null,
    ...overrides,
  };
}

describe("rankAttention", () => {
  it("puts what is already wrong before what is merely waiting", () => {
    const ranked = rankAttention([
      item({ id: "info", tone: "info" }),
      item({ id: "warning", tone: "warning" }),
      item({ id: "danger", tone: "danger" }),
    ]);
    expect(ranked.map((i) => i.id)).toEqual(["danger", "warning", "info"]);
  });

  it("does not mutate its input", () => {
    const input = [item({ id: "b", tone: "info" }), item({ id: "a", tone: "danger" })];
    rankAttention(input);
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("nextRenewalDate", () => {
  it("returns this year's date when it is still ahead", () => {
    const next = nextRenewalDate(10, 1, new Date(2026, 8, 17));
    expect(next).toEqual(new Date(2026, 9, 1));
  });

  it("returns today when renewal is today", () => {
    const next = nextRenewalDate(9, 17, new Date(2026, 8, 17, 15, 30));
    expect(next).toEqual(new Date(2026, 8, 17));
  });

  it("rolls to next year once the date has passed", () => {
    const next = nextRenewalDate(1, 15, new Date(2026, 8, 17));
    expect(next).toEqual(new Date(2027, 0, 15));
  });

  it("clamps a day the month does not have to the month's last day", () => {
    const next = nextRenewalDate(2, 31, new Date(2028, 0, 1));
    expect(next).toEqual(new Date(2028, 1, 29));
  });

  it("is null without a configured date", () => {
    expect(nextRenewalDate(null, 1, new Date())).toBeNull();
    expect(nextRenewalDate(1, null, new Date())).toBeNull();
  });
});

describe("daysUntil / groupByDay", () => {
  const now = new Date(2026, 8, 17, 9, 0);

  it("counts calendar days, not 24-hour spans", () => {
    expect(daysUntil(new Date(2026, 8, 17, 23, 59), now)).toBe(0);
    expect(daysUntil(new Date(2026, 8, 18, 0, 1), now)).toBe(1);
    expect(daysUntil(new Date(2026, 8, 16, 23, 0), now)).toBe(-1);
  });

  it("buckets sorted items by calendar day and keeps their order", () => {
    const items = sortUpcoming([
      { id: "c", module: "events", kind: "event", at: new Date(2026, 8, 18, 18), title: "c", detail: "", href: "" },
      { id: "a", module: "events", kind: "event", at: new Date(2026, 8, 17, 10), title: "a", detail: "", href: "" },
      { id: "b", module: "events", kind: "event", at: new Date(2026, 8, 17, 12), title: "b", detail: "", href: "" },
    ]);
    const days = groupByDay(items, now);
    expect(days.map((d) => d.dayOffset)).toEqual([0, 1]);
    expect(days[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(days[1].items.map((i) => i.id)).toEqual(["c"]);
  });
});
