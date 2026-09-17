import { and, eq, isNull, sql } from "drizzle-orm";

import { isRsvpOpen, resolveStanding, seatsTaken } from "@/lib/events/rsvp";
import { db } from "@/server/db";
import { eventResponses, events, type EventRsvpAnswer } from "@/server/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Error codes surfaced to the UI as the thrown message. The safe-action client
 * forwards `error.message`, so the client switches on these strings.
 */
export type EventErrorCode =
  | "RSVP_CLOSED"
  | "NOT_ELIGIBLE"
  | "TOO_MANY_GUESTS"
  | "TOKEN_INVALID"
  | "CAPACITY_EXCEEDED"
  | "RATE_LIMITED"
  | "SLUG_TAKEN"
  | "NOT_FOUND";

export class EventError extends Error {
  constructor(public readonly code: EventErrorCode) {
    super(code);
    this.name = "EventError";
  }
}

export type Responder =
  | { memberId: string; guestEmail?: null; guestName?: null }
  | { memberId?: null; guestEmail: string; guestName: string };

/**
 * The one write path for every RSVP (portal, token, public guest).
 *
 * Locks the event row `FOR UPDATE` so two people racing for the last seat are
 * serialized: the second reads the first's committed row and lands on the
 * reserve list. Seats are counted excluding the responder's own current row —
 * they compete against everyone else, not their previous self.
 */
export async function upsertResponse(
  tx: Tx,
  params: {
    orgId: string;
    eventId: string;
    responder: Responder;
    answer: EventRsvpAnswer;
    guestCount: number;
    now?: Date;
  },
) {
  const now = params.now ?? new Date();

  const [event] = await tx
    .select()
    .from(events)
    .where(
      and(
        eq(events.orgId, params.orgId),
        eq(events.id, params.eventId),
        isNull(events.deletedAt),
      ),
    )
    .for("update")
    .limit(1);

  if (!event) throw new EventError("NOT_FOUND");

  const open = isRsvpOpen(event, now);
  if (!open.open) throw new EventError("RSVP_CLOSED");

  if (params.guestCount > event.maxGuestsPerResponse) {
    throw new EventError("TOO_MANY_GUESTS");
  }

  const ownRowClause = params.responder.memberId
    ? eq(eventResponses.memberId, params.responder.memberId)
    : sql`lower(${eventResponses.guestEmail}) = lower(${params.responder.guestEmail})`;

  const existing = await tx
    .select()
    .from(eventResponses)
    .where(and(eq(eventResponses.eventId, event.id), ownRowClause))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const others = await tx
    .select({
      answer: eventResponses.answer,
      standing: eventResponses.standing,
      guestCount: eventResponses.guestCount,
    })
    .from(eventResponses)
    .where(
      existing
        ? and(eq(eventResponses.eventId, event.id), sql`${eventResponses.id} <> ${existing.id}`)
        : eq(eventResponses.eventId, event.id),
    );

  const standing =
    params.answer === "yes"
      ? resolveStanding({
          capacity: event.capacity,
          seatsTaken: seatsTaken(others),
          guestCount: params.guestCount,
        })
      : "confirmed";

  if (existing) {
    const [updated] = await tx
      .update(eventResponses)
      .set({
        answer: params.answer,
        guestCount: params.guestCount,
        standing,
        // A guest re-answering may have corrected their name.
        ...(params.responder.guestName ? { guestName: params.responder.guestName } : {}),
        confirmedByUserId: null,
        updatedAt: now,
      })
      .where(eq(eventResponses.id, existing.id))
      .returning();

    return { event, response: updated!, created: false as const };
  }

  const [created] = await tx
    .insert(eventResponses)
    .values({
      orgId: params.orgId,
      eventId: event.id,
      memberId: params.responder.memberId ?? null,
      guestEmail: params.responder.guestEmail?.trim().toLowerCase() ?? null,
      guestName: params.responder.guestName ?? null,
      answer: params.answer,
      guestCount: params.guestCount,
      standing,
      respondedAt: now,
    })
    .returning();

  return { event, response: created!, created: true as const };
}
