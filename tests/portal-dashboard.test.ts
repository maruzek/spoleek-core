import { describe, expect, it } from "vitest";

import { profileCompleteness, rankTodos, type PortalTodo } from "@/lib/portal-dashboard";

const field = (key: string, required: boolean, type = "text") =>
  ({ key, label: key, required, type }) as Parameters<typeof profileCompleteness>[0][number];

describe("profileCompleteness", () => {
  it("is 100% with nothing asked", () => {
    expect(profileCompleteness([], {})).toMatchObject({ total: 0, filled: 0, percent: 100 });
  });

  it("counts blanks, empty arrays and unchecked booleans as missing", () => {
    const result = profileCompleteness(
      [field("a", true), field("b", false, "multi_select"), field("c", true, "boolean"), field("d", false)],
      { a: "  ", b: [], c: false, d: "x" },
    );
    expect(result.filled).toBe(1);
    expect(result.percent).toBe(25);
    expect(result.missingRequired.map((f) => f.key)).toEqual(["a", "c"]);
    expect(result.missingOptional.map((f) => f.key)).toEqual(["b"]);
  });
});

describe("rankTodos", () => {
  const todo = (id: string, kind: PortalTodo["kind"], dueAt: Date | null = null): PortalTodo => ({
    id, kind, area: "events", title: id, detail: "", href: "", dueAt,
  });

  it("puts a required profile first, then late money, then deadlines soonest first", () => {
    const ranked = rankTodos([
      todo("form-late", "form_pending", new Date(2026, 9, 1)),
      todo("rsvp-soon", "rsvp_needed", new Date(2026, 8, 20)),
      todo("rsvp-later", "rsvp_needed", new Date(2026, 8, 25)),
      todo("rsvp-nodate", "rsvp_needed"),
      todo("overdue", "payment_overdue"),
      todo("optional", "profile_optional"),
      todo("profile", "profile_required"),
    ]);
    expect(ranked.map((t) => t.id)).toEqual([
      "profile", "overdue", "rsvp-soon", "rsvp-later", "rsvp-nodate", "form-late", "optional",
    ]);
  });
});
