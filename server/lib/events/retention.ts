import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  eventAudience,
  eventResponses,
  eventRsvpTokens,
  events,
  organizations,
} from "@/server/db/schema";

/** Events with no dates at all are shredded this long after creation. */
export const UNDATED_EVENT_RETENTION_DAYS = 180;

const BATCH_SIZE = 200;

/**
 * Removes guest identities from events that are over.
 *
 * Per organization, an event counts as over `eventGuestRetentionDays` after
 * `endsAt ?? startsAt`; undated events fall back to `createdAt` + 180 days.
 * Tokens and external audience rows are deleted; guest responses keep their
 * answer, guest count and standing with the name and email nulled, so the
 * headcount a manager reported stays true. Member responses are attendance
 * history and are left alone (they cascade on member erasure).
 */
export async function shredEventGuestData(now = new Date()) {
  const days = sql`(${organizations.eventGuestRetentionDays} * interval '1 day')`;
  const undated = sql`(${UNDATED_EVENT_RETENTION_DAYS} * interval '1 day')`;

  const due = await db
    .select({ id: events.id })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.orgId))
    .where(
      or(
        and(
          isNotNull(sql`coalesce(${events.endsAt}, ${events.startsAt})`),
          lt(sql`coalesce(${events.endsAt}, ${events.startsAt}) + ${days}`, now),
        ),
        and(
          isNull(events.endsAt),
          isNull(events.startsAt),
          lt(sql`${events.createdAt} + ${undated}`, now),
        ),
      ),
    );

  let tokensDeleted = 0;
  let externalsDeleted = 0;
  let responsesAnonymised = 0;

  for (let i = 0; i < due.length; i += BATCH_SIZE) {
    const ids = due.slice(i, i + BATCH_SIZE).map((row) => row.id);

    const tokens = await db
      .delete(eventRsvpTokens)
      .where(inArray(eventRsvpTokens.eventId, ids))
      .returning({ id: eventRsvpTokens.id });
    tokensDeleted += tokens.length;

    const externals = await db
      .delete(eventAudience)
      .where(and(inArray(eventAudience.eventId, ids), eq(eventAudience.kind, "external")))
      .returning({ id: eventAudience.id });
    externalsDeleted += externals.length;

    const responses = await db
      .update(eventResponses)
      .set({ guestEmail: null, guestName: null })
      .where(
        and(
          inArray(eventResponses.eventId, ids),
          isNull(eventResponses.memberId),
          isNotNull(eventResponses.guestEmail),
        ),
      )
      .returning({ id: eventResponses.id });
    responsesAnonymised += responses.length;
  }

  return {
    eventsChecked: due.length,
    tokensDeleted,
    externalsDeleted,
    responsesAnonymised,
  };
}
