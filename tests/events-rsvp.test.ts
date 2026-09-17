import { describe, expect, it } from "vitest";

import {
  canPromote,
  isRsvpOpen,
  isTokenValid,
  resolveStanding,
  seatsTaken,
  type RsvpEvent,
  type SeatResponse,
} from "@/lib/events/rsvp";

const now = new Date("2026-09-13T12:00:00Z");
const past = new Date("2026-09-01T12:00:00Z");
const future = new Date("2026-10-01T12:00:00Z");
const farFuture = new Date("2026-11-01T12:00:00Z");

const event = (overrides: Partial<RsvpEvent> = {}): RsvpEvent => ({
  status: "published",
  startsAt: null,
  endsAt: null,
  rsvpDeadlineAt: null,
  deletedAt: null,
  ...overrides,
});

const yes = (guestCount = 0, standing: SeatResponse["standing"] = "confirmed"): SeatResponse => ({
  answer: "yes",
  standing,
  guestCount,
});

describe("isRsvpOpen", () => {
  it("is closed for drafts and cancelled events whatever the dates", () => {
    expect(isRsvpOpen(event({ status: "draft", startsAt: future }), now)).toEqual({
      open: false,
      reason: "draft",
    });
    expect(
      isRsvpOpen(event({ status: "cancelled", startsAt: future }), now),
    ).toEqual({ open: false, reason: "cancelled" });
  });

  it("is open for a published event with no dates and no deadline", () => {
    expect(isRsvpOpen(event(), now)).toEqual({ open: true });
  });

  it.each([
    ["future start only", { startsAt: future }, true],
    ["past start only", { startsAt: past }, false],
    ["past start, future end", { startsAt: past, endsAt: future }, true],
    ["past start, past end", { startsAt: past, endsAt: past }, false],
    ["future deadline", { rsvpDeadlineAt: future }, true],
    ["past deadline", { rsvpDeadlineAt: past }, false],
    ["past deadline, future event", { rsvpDeadlineAt: past, startsAt: future }, false],
    ["future deadline, past event", { rsvpDeadlineAt: future, startsAt: past }, false],
  ] as const)("%s → open=%s", (_label, overrides, expected) => {
    expect(isRsvpOpen(event(overrides), now).open).toBe(expected);
  });

  it("reports the deadline before the event when both have passed", () => {
    expect(
      isRsvpOpen(event({ rsvpDeadlineAt: past, startsAt: past }), now),
    ).toEqual({ open: false, reason: "deadline_passed" });
  });

  it("uses endsAt over startsAt as the end of the event", () => {
    expect(isRsvpOpen(event({ startsAt: past, endsAt: farFuture }), now)).toEqual({
      open: true,
    });
    expect(isRsvpOpen(event({ startsAt: past }), now)).toEqual({
      open: false,
      reason: "event_over",
    });
  });

  it("is still open at the exact deadline instant", () => {
    expect(isRsvpOpen(event({ rsvpDeadlineAt: now }), now)).toEqual({ open: true });
  });
});

describe("seatsTaken", () => {
  it("counts 1 + guests over confirmed yes only", () => {
    expect(
      seatsTaken([
        yes(2),
        yes(0),
        yes(3, "reserve"),
        { answer: "no", standing: "confirmed", guestCount: 4 },
        { answer: "maybe", standing: "confirmed", guestCount: 1 },
      ]),
    ).toBe(4);
  });

  it("is zero with no responses", () => {
    expect(seatsTaken([])).toBe(0);
  });
});

describe("resolveStanding", () => {
  it("never yields reserve without a capacity", () => {
    expect(
      resolveStanding({ capacity: null, seatsTaken: 1_000, guestCount: 50 }),
    ).toBe("confirmed");
  });

  it("confirms when the whole party fits exactly", () => {
    expect(resolveStanding({ capacity: 10, seatsTaken: 7, guestCount: 2 })).toBe(
      "confirmed",
    );
  });

  it("reserves when one guest too many", () => {
    expect(resolveStanding({ capacity: 10, seatsTaken: 7, guestCount: 3 })).toBe(
      "reserve",
    );
  });

  it("reserves when already full", () => {
    expect(resolveStanding({ capacity: 10, seatsTaken: 10, guestCount: 0 })).toBe(
      "reserve",
    );
  });

  it("puts a raised guest count past capacity on reserve as a whole", () => {
    // A confirmed responder with 1 guest (2 seats of 10, others hold 8) raises
    // to 2 guests. The caller subtracts their own 2 seats first: 8 + 1 + 2 > 10.
    const others = 8;
    expect(resolveStanding({ capacity: 10, seatsTaken: others, guestCount: 2 })).toBe(
      "reserve",
    );
  });
});

describe("canPromote", () => {
  it("refuses anything but a reserve yes", () => {
    expect(
      canPromote({ capacity: 10, seatsTaken: 0, response: yes(0, "confirmed") }),
    ).toBe(false);
    expect(
      canPromote({
        capacity: 10,
        seatsTaken: 0,
        response: { answer: "maybe", standing: "reserve", guestCount: 0 },
      }),
    ).toBe(false);
  });

  it("allows promotion into a free seat and refuses past capacity", () => {
    expect(canPromote({ capacity: 10, seatsTaken: 8, response: yes(1, "reserve") })).toBe(true);
    expect(canPromote({ capacity: 10, seatsTaken: 9, response: yes(1, "reserve") })).toBe(false);
  });

  it("always allows promotion without a capacity", () => {
    expect(canPromote({ capacity: null, seatsTaken: 99, response: yes(5, "reserve") })).toBe(true);
  });

  it("freeing seats does not promote anyone by itself", () => {
    // Somebody leaving only changes seatsTaken; the reserve row stays reserve
    // until a manager calls canPromote and acts on it.
    const reserve = yes(0, "reserve");
    expect(seatsTaken([reserve])).toBe(0);
    expect(canPromote({ capacity: 1, seatsTaken: 0, response: reserve })).toBe(true);
    expect(reserve.standing).toBe("reserve");
  });
});

describe("isTokenValid", () => {
  const issuedAt = new Date("2026-06-01T00:00:00Z");

  it("follows the event's RSVP window when it has dates", () => {
    expect(
      isTokenValid({ event: event({ startsAt: future }), token: { issuedAt }, now }),
    ).toEqual({ open: true });
    expect(
      isTokenValid({ event: event({ startsAt: past }), token: { issuedAt }, now }),
    ).toEqual({ open: false, reason: "event_over" });
  });

  it("falls back to 90 days from issue when the event has no dates and no deadline", () => {
    const day89 = new Date(issuedAt.getTime() + 89 * 86_400_000);
    const day91 = new Date(issuedAt.getTime() + 91 * 86_400_000);
    expect(isTokenValid({ event: event(), token: { issuedAt }, now: day89 })).toEqual({
      open: true,
    });
    expect(isTokenValid({ event: event(), token: { issuedAt }, now: day91 })).toEqual({
      open: false,
      reason: "token_expired",
    });
  });

  it("does not apply the fallback when a deadline is set", () => {
    const day91 = new Date(issuedAt.getTime() + 91 * 86_400_000);
    expect(
      isTokenValid({
        event: event({ rsvpDeadlineAt: farFuture }),
        token: { issuedAt },
        now: day91,
      }),
    ).toEqual({ open: true });
  });

  it("is invalid for soft-deleted, draft and cancelled events", () => {
    expect(
      isTokenValid({ event: event({ deletedAt: past }), token: { issuedAt }, now }),
    ).toEqual({ open: false, reason: "event_deleted" });
    expect(
      isTokenValid({ event: event({ status: "draft" }), token: { issuedAt }, now }),
    ).toEqual({ open: false, reason: "draft" });
    expect(
      isTokenValid({ event: event({ status: "cancelled" }), token: { issuedAt }, now }),
    ).toEqual({ open: false, reason: "cancelled" });
  });
});
