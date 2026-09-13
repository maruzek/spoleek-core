import type {
  EventRsvpAnswer,
  EventRsvpStanding,
  EventStatus,
} from "@/server/db/schema";

/**
 * RSVP rules as pure functions over already-loaded rows.
 *
 * Nothing here touches the database: the action layer loads the event and its
 * responses (under `FOR UPDATE` when it matters) and asks these functions what
 * the answer is. Keeping the arithmetic out of the queries is what makes the
 * capacity edge cases table-testable without a Postgres.
 */

/** The slice of `events` the rules need. */
export type RsvpEvent = {
  status: EventStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  rsvpDeadlineAt: Date | null;
  deletedAt?: Date | null;
};

export type RsvpClosedReason =
  | "draft"
  | "cancelled"
  | "deadline_passed"
  | "event_over";

export type RsvpOpenResult =
  | { open: true }
  | { open: false; reason: RsvpClosedReason };

/** The slice of `event_responses` that counts seats. */
export type SeatResponse = {
  answer: EventRsvpAnswer;
  standing: EventRsvpStanding;
  guestCount: number;
};

/**
 * Tokens with no event dates and no deadline fall back to this window from
 * `issuedAt`, so a "save the date" without a date cannot mint links that work
 * forever.
 */
export const TOKEN_FALLBACK_DAYS = 90;

/** The instant the event is over: `endsAt`, else `startsAt`, else never. */
export function eventEndInstant(event: Pick<RsvpEvent, "startsAt" | "endsAt">) {
  return event.endsAt ?? event.startsAt ?? null;
}

/**
 * Whether answers are accepted right now.
 *
 * Reasons are ordered by how much they explain: a draft is closed whatever the
 * dates say, and a passed deadline is the more useful message than "event
 * over" when both are true.
 */
export function isRsvpOpen(event: RsvpEvent, now: Date): RsvpOpenResult {
  if (event.status === "draft") return { open: false, reason: "draft" };
  if (event.status === "cancelled") return { open: false, reason: "cancelled" };

  if (event.rsvpDeadlineAt && now > event.rsvpDeadlineAt) {
    return { open: false, reason: "deadline_passed" };
  }

  const end = eventEndInstant(event);
  if (end && now > end) {
    return { open: false, reason: "event_over" };
  }

  return { open: true };
}

/** `Σ (1 + guestCount)` over confirmed yes answers. No, maybe and reserve take no seats. */
export function seatsTaken(responses: readonly SeatResponse[]): number {
  let taken = 0;
  for (const response of responses) {
    if (response.answer === "yes" && response.standing === "confirmed") {
      taken += 1 + response.guestCount;
    }
  }
  return taken;
}

/**
 * The standing of a new or changed `yes` bringing `guestCount` guests.
 *
 * `seatsTaken` must already exclude the responder's own current row — a member
 * changing from 1 guest to 2 competes for seats against everyone else, not
 * against their previous self. The caller is responsible for that subtraction
 * because only it knows which row is "own".
 *
 * A party is placed as a whole: a responder who would fit alone but not with
 * their guests goes to the reserve list entire, never split.
 */
export function resolveStanding(params: {
  capacity: number | null;
  seatsTaken: number;
  guestCount: number;
}): EventRsvpStanding {
  const { capacity, seatsTaken, guestCount } = params;
  if (capacity === null) return "confirmed";
  return seatsTaken + 1 + guestCount <= capacity ? "confirmed" : "reserve";
}

/**
 * Whether a manager may move a reserve response to `confirmed`.
 *
 * `seatsTaken` here includes everybody currently confirmed (the candidate is
 * on the reserve list, so it is not among them). Reserve order is advisory:
 * managers may promote out of order, but never past capacity.
 */
export function canPromote(params: {
  capacity: number | null;
  seatsTaken: number;
  response: SeatResponse;
}): boolean {
  const { capacity, seatsTaken, response } = params;
  if (response.answer !== "yes" || response.standing !== "reserve") return false;
  if (capacity === null) return true;
  return seatsTaken + 1 + response.guestCount <= capacity;
}

/**
 * Whether an RSVP link still works.
 *
 * Validity is the live event's, not a stored expiry (see the table comment on
 * `event_rsvp_tokens`). The one case the event cannot decide — no dates, no
 * deadline — falls back to `TOKEN_FALLBACK_DAYS` from issue.
 */
export function isTokenValid(params: {
  event: RsvpEvent;
  token: { issuedAt: Date };
  now: Date;
}): RsvpOpenResult | { open: false; reason: "token_expired" | "event_deleted" } {
  const { event, token, now } = params;

  if (event.deletedAt) return { open: false, reason: "event_deleted" };

  const open = isRsvpOpen(event, now);
  if (!open.open) return open;

  const undated = !event.startsAt && !event.endsAt && !event.rsvpDeadlineAt;
  if (undated) {
    const expiresAt = new Date(
      token.issuedAt.getTime() + TOKEN_FALLBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    if (now > expiresAt) return { open: false, reason: "token_expired" };
  }

  return { open: true };
}
