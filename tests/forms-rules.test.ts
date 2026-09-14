import { describe, expect, it } from "vitest";

import {
  canSubmit,
  getFormPlacement,
  getShredAnchor,
  isFormOpen,
  isPending,
  isShredDue,
  type FormViewer,
  type RuleEvent,
  type RuleForm,
} from "@/lib/forms/rules";

const now = new Date("2026-09-13T12:00:00Z");
const past = new Date("2026-09-01T12:00:00Z");
const future = new Date("2026-10-01T12:00:00Z");
const farFuture = new Date("2026-11-01T12:00:00Z");

const form = (overrides: Partial<RuleForm> = {}): RuleForm => ({
  status: "open",
  timing: "anytime",
  required: true,
  onlyRsvpYes: false,
  closesAt: null,
  eventId: "e1",
  ...overrides,
});

const event = (overrides: Partial<RuleEvent> = {}): RuleEvent => ({
  status: "published",
  startsAt: null,
  endsAt: null,
  deletedAt: null,
  ...overrides,
});

const member = (overrides: Partial<Extract<FormViewer, { kind: "member" }>> = {}): FormViewer => ({
  kind: "member",
  eligible: true,
  rsvpAnswer: "yes",
  ...overrides,
});

describe("isFormOpen", () => {
  it("is open for an open form on a live event", () => {
    expect(isFormOpen(form(), event(), now)).toEqual({ open: true });
  });

  it("is open for an unlinked open form", () => {
    expect(isFormOpen(form({ eventId: null }), null, now)).toEqual({ open: true });
  });

  it.each([
    ["draft", "draft"],
    ["closed", "closed"],
  ] as const)("reports %s status before anything else", (status, reason) => {
    expect(
      isFormOpen(form({ status, closesAt: past }), event({ status: "cancelled" }), now),
    ).toEqual({ open: false, reason });
  });

  it("closes with a deleted event", () => {
    expect(isFormOpen(form(), event({ deletedAt: past }), now)).toEqual({
      open: false,
      reason: "event_deleted",
    });
  });

  it("closes with a cancelled event, ahead of the deadline", () => {
    expect(isFormOpen(form({ closesAt: past }), event({ status: "cancelled" }), now)).toEqual({
      open: false,
      reason: "event_cancelled",
    });
  });

  it("closes after closesAt", () => {
    expect(isFormOpen(form({ closesAt: past }), event(), now)).toEqual({
      open: false,
      reason: "deadline_passed",
    });
    expect(isFormOpen(form({ closesAt: future }), event(), now)).toEqual({ open: true });
  });

  it("does not care about the event being over", () => {
    expect(isFormOpen(form(), event({ startsAt: past, endsAt: past }), now)).toEqual({
      open: true,
    });
  });
});

describe("getFormPlacement", () => {
  const upcoming = event({ startsAt: future, endsAt: farFuture });
  const running = event({ startsAt: past, endsAt: future });
  const over = event({ startsAt: past, endsAt: past });

  it("puts after_rsvp inline whenever there is an event", () => {
    expect(getFormPlacement(form({ timing: "after_rsvp" }), event(), now)).toBe(
      "inline_after_rsvp",
    );
    expect(getFormPlacement(form({ timing: "after_rsvp" }), over, now)).toBe(
      "inline_after_rsvp",
    );
  });

  it("lists after_rsvp as a plain card without an event", () => {
    expect(getFormPlacement(form({ timing: "after_rsvp", eventId: null }), null, now)).toBe(
      "pending",
    );
  });

  it("nags for before_event only until the event starts", () => {
    expect(getFormPlacement(form({ timing: "before_event" }), upcoming, now)).toBe("pending");
    expect(getFormPlacement(form({ timing: "before_event" }), running, now)).toBe("listed");
    expect(getFormPlacement(form({ timing: "before_event" }), over, now)).toBe("listed");
  });

  it("nags for during_event from the start on", () => {
    expect(getFormPlacement(form({ timing: "during_event" }), upcoming, now)).toBe("listed");
    expect(getFormPlacement(form({ timing: "during_event" }), running, now)).toBe("pending");
    expect(getFormPlacement(form({ timing: "during_event" }), over, now)).toBe("pending");
  });

  it("nags for after_event only once the event is over", () => {
    expect(getFormPlacement(form({ timing: "after_event" }), upcoming, now)).toBe("listed");
    expect(getFormPlacement(form({ timing: "after_event" }), running, now)).toBe("listed");
    expect(getFormPlacement(form({ timing: "after_event" }), over, now)).toBe("pending");
  });

  it("uses startsAt as the end when endsAt is missing", () => {
    const startedOnly = event({ startsAt: past });
    expect(getFormPlacement(form({ timing: "after_event" }), startedOnly, now)).toBe("pending");
    expect(getFormPlacement(form({ timing: "during_event" }), startedOnly, now)).toBe("pending");
  });

  it("always nags for anytime", () => {
    for (const e of [upcoming, running, over, event(), null]) {
      expect(getFormPlacement(form({ timing: "anytime" }), e, now)).toBe("pending");
    }
  });

  it("treats every timing as anytime without event dates", () => {
    for (const timing of ["before_event", "during_event", "after_event"] as const) {
      expect(getFormPlacement(form({ timing }), event(), now)).toBe("pending");
      expect(getFormPlacement(form({ timing, eventId: null }), null, now)).toBe("pending");
    }
  });
});

describe("canSubmit", () => {
  it("accepts an eligible member on an open form", () => {
    expect(canSubmit({ form: form(), event: event(), viewer: member(), now })).toEqual({
      ok: true,
    });
  });

  it("refuses a closed form before looking at the viewer", () => {
    expect(
      canSubmit({
        form: form({ status: "closed" }),
        event: event(),
        viewer: member({ eligible: false }),
        now,
      }),
    ).toEqual({ ok: false, reason: "FORM_CLOSED" });
  });

  it("refuses an ineligible member", () => {
    expect(
      canSubmit({ form: form(), event: event(), viewer: member({ eligible: false }), now }),
    ).toEqual({ ok: false, reason: "NOT_ELIGIBLE" });
  });

  it("enforces onlyRsvpYes for every channel", () => {
    const f = form({ onlyRsvpYes: true });
    for (const viewer of [
      member({ rsvpAnswer: "maybe" }),
      member({ rsvpAnswer: null }),
      { kind: "token", rsvpAnswer: "no" } as const,
      { kind: "guest" } as const,
    ]) {
      expect(canSubmit({ form: f, event: event(), viewer, now })).toEqual({
        ok: false,
        reason: "RSVP_REQUIRED",
      });
    }
    for (const viewer of [
      member(),
      { kind: "token", rsvpAnswer: "yes" } as const,
      { kind: "guest", rsvpAnswer: "yes" } as const,
    ]) {
      expect(canSubmit({ form: f, event: event(), viewer, now })).toEqual({ ok: true });
    }
  });

  it("ignores onlyRsvpYes on an unlinked form", () => {
    expect(
      canSubmit({
        form: form({ onlyRsvpYes: true, eventId: null }),
        event: null,
        viewer: member({ rsvpAnswer: null }),
        now,
      }),
    ).toEqual({ ok: true });
  });

  it("gives tokens and guests no way into an unlinked form", () => {
    for (const viewer of [
      { kind: "token", rsvpAnswer: "yes" } as const,
      { kind: "guest" } as const,
    ]) {
      expect(
        canSubmit({ form: form({ eventId: null }), event: null, viewer, now }),
      ).toEqual({ ok: false, reason: "NOT_ELIGIBLE" });
    }
  });

  it("lets tokens and guests into a linked form", () => {
    for (const viewer of [
      { kind: "token", rsvpAnswer: null } as const,
      { kind: "guest" } as const,
    ]) {
      expect(canSubmit({ form: form(), event: event(), viewer, now })).toEqual({ ok: true });
    }
  });
});

describe("isPending", () => {
  const base = { event: event(), viewer: member(), now };

  it("is pending for a required, open, submittable form without a submission", () => {
    expect(isPending({ ...base, form: form(), hasSubmission: false })).toBe(true);
  });

  it("is not pending once submitted", () => {
    expect(isPending({ ...base, form: form(), hasSubmission: true })).toBe(false);
  });

  it("is never pending for an optional form", () => {
    expect(isPending({ ...base, form: form({ required: false }), hasSubmission: false })).toBe(
      false,
    );
  });

  it("is not pending when the viewer cannot submit", () => {
    expect(
      isPending({ ...base, form: form({ status: "closed" }), hasSubmission: false }),
    ).toBe(false);
    expect(
      isPending({ ...base, form: form({ onlyRsvpYes: true }), viewer: member({ rsvpAnswer: "no" }), hasSubmission: false }),
    ).toBe(false);
  });

  it("does not depend on placement", () => {
    expect(
      isPending({
        ...base,
        form: form({ timing: "before_event" }),
        event: event({ startsAt: past, endsAt: past }),
        hasSubmission: false,
      }),
    ).toBe(true);
  });
});

describe("shredding", () => {
  it("anchors on the event end, then start, then closesAt", () => {
    expect(getShredAnchor(form({ closesAt: future }), event({ startsAt: past, endsAt: now }))).toBe(now);
    expect(getShredAnchor(form({ closesAt: future }), event({ startsAt: past }))).toBe(past);
    expect(getShredAnchor(form({ closesAt: future, eventId: null }), null)).toBe(future);
  });

  it("has no anchor for an undated event or an unlinked form without a deadline", () => {
    expect(getShredAnchor(form({ closesAt: future }), event())).toBeNull();
    expect(getShredAnchor(form({ eventId: null }), null)).toBeNull();
  });

  it("is due once anchor + N days has passed", () => {
    const anchor = new Date("2026-09-01T12:00:00Z");
    expect(isShredDue({ shredAfterEventDays: 10 }, anchor, now)).toBe(true);
    expect(isShredDue({ shredAfterEventDays: 12 }, anchor, now)).toBe(false);
    expect(isShredDue({ shredAfterEventDays: 12 }, anchor, new Date("2026-09-13T12:00:01Z"))).toBe(true);
  });

  it("is never due without a TTL or an anchor", () => {
    expect(isShredDue({ shredAfterEventDays: null }, past, now)).toBe(false);
    expect(isShredDue({ shredAfterEventDays: 1 }, null, now)).toBe(false);
  });
});
