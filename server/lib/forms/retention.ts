import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  events,
  formAnswers,
  formQuestions,
  formSubmissions,
  forms,
  organizations,
} from "@/server/db/schema";
import { UNDATED_EVENT_RETENTION_DAYS } from "@/server/lib/events/retention";

const BATCH_SIZE = 200;

/**
 * Nulls answers whose question's TTL has passed and anonymises guest
 * submissions on the event guest schedule.
 *
 * The anchor is the linked event's `endsAt ?? startsAt` (the event row is
 * read even when soft-deleted: a deleted event still ends), or `closesAt` for
 * an unlinked form. A question with no anchor is left alone — the editor
 * warns about it — because guessing a date is how data quietly outlives its
 * purpose *or* vanishes before it. `shreddedAt` is set on a submission once
 * no live answer to a shreddable question remains.
 */
export async function shredFormAnswers(now = new Date()) {
  const anchor = sql`CASE WHEN ${forms.eventId} IS NOT NULL THEN coalesce(${events.endsAt}, ${events.startsAt}) ELSE ${forms.closesAt} END`;
  const ttl = sql`(${formQuestions.shredAfterEventDays} * interval '1 day')`;

  const due = await db
    .select({ questionId: formQuestions.id, formId: formQuestions.formId })
    .from(formQuestions)
    .innerJoin(forms, eq(forms.id, formQuestions.formId))
    .leftJoin(events, eq(events.id, forms.eventId))
    .where(
      and(
        isNotNull(formQuestions.shredAfterEventDays),
        isNotNull(anchor),
        lt(sql`${anchor} + ${ttl}`, now),
      ),
    );

  let answersShredded = 0;
  const touchedFormIds = new Set<string>();

  for (let i = 0; i < due.length; i += BATCH_SIZE) {
    const batch = due.slice(i, i + BATCH_SIZE);
    const ids = batch.map((row) => row.questionId);

    const shredded = await db
      .update(formAnswers)
      .set({ value: null, encryptedValue: null })
      .where(
        and(
          inArray(formAnswers.questionId, ids),
          or(isNotNull(formAnswers.value), isNotNull(formAnswers.encryptedValue)),
        ),
      )
      .returning({ id: formAnswers.id });
    answersShredded += shredded.length;

    for (const row of batch) touchedFormIds.add(row.formId);
  }

  let submissionsMarked = 0;
  if (touchedFormIds.size > 0) {
    const formIds = [...touchedFormIds];
    const liveShreddable = sql`EXISTS (
      SELECT 1 FROM ${formAnswers} a
      INNER JOIN ${formQuestions} q ON q.id = a.question_id
      WHERE a.submission_id = ${formSubmissions.id}
        AND q.shred_after_event_days IS NOT NULL
        AND (a.value IS NOT NULL OR a.encrypted_value IS NOT NULL)
    )`;

    const marked = await db
      .update(formSubmissions)
      .set({ shreddedAt: now })
      .where(
        and(
          inArray(formSubmissions.formId, formIds),
          isNull(formSubmissions.shreddedAt),
          sql`NOT ${liveShreddable}`,
        ),
      )
      .returning({ id: formSubmissions.id });
    submissionsMarked = marked.length;
  }

  // Guest identities on the same schedule as event guests.
  const days = sql`(${organizations.eventGuestRetentionDays} * interval '1 day')`;
  const undated = sql`(${UNDATED_EVENT_RETENTION_DAYS} * interval '1 day')`;
  const dueEvents = await db
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

  let guestsAnonymised = 0;
  for (let i = 0; i < dueEvents.length; i += BATCH_SIZE) {
    const eventIds = dueEvents.slice(i, i + BATCH_SIZE).map((row) => row.id);
    const formRows = await db
      .select({ id: forms.id })
      .from(forms)
      .where(inArray(forms.eventId, eventIds));
    if (formRows.length === 0) continue;

    const anonymised = await db
      .update(formSubmissions)
      .set({ guestEmail: null, guestName: null })
      .where(
        and(
          inArray(formSubmissions.formId, formRows.map((row) => row.id)),
          isNull(formSubmissions.memberId),
          isNotNull(formSubmissions.guestEmail),
        ),
      )
      .returning({ id: formSubmissions.id });
    guestsAnonymised += anonymised.length;
  }

  return {
    questionsChecked: due.length,
    answersShredded,
    submissionsMarked,
    guestsAnonymised,
  };
}
