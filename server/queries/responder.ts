import { and, eq, sql } from "drizzle-orm";

import { isRsvpOpen, isTokenValid } from "@/lib/events/rsvp";
import {
  responseOwnerOf,
  selectAfterRsvpForm,
  submissionIdentityOf,
  tokenLinkState,
  type AfterRsvpForm,
  type Responder,
  type RsvpView,
} from "@/lib/events/responder";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { db } from "@/server/db";
import { eventAudience, eventResponses, tenantMembers, type Event, type EventResponse } from "@/server/db/schema";
import { findTokenHolder } from "@/server/lib/events/tokens";
import type { SubmissionIdentity } from "@/server/lib/forms/submissions";
import {
  getEventById,
  getEventCounts,
  getLivePaymentForResponse,
  type EventCounts,
} from "@/server/queries/events";
import { getFormForFiller, listFormsForEvent, type EventFormItem } from "@/server/queries/forms";

/**
 * The Responder (CONTEXT.md): resolving one behind each door, and the one
 * view of an event every RSVP surface renders from.
 */

// ─── Doors ──────────────────────────────────────────────────────────────────

/** The signed-in member, already loaded by the page's access guard. */
export type MemberResponder = Extract<Responder, { kind: "member" }>;

export function memberResponder(member: { id: string; firstName: string; lastName: string }): MemberResponder {
  return { kind: "member", memberId: member.id, displayName: getMemberDisplayName(member) };
}

export type TokenResponder = Extract<Responder, { kind: "token" }>;

/**
 * A personal link, resolved to its event and holder — or null when the link
 * is dead: unknown, another organization's, expired, or on a deleted or
 * draft event. A link on a *closed* RSVP still resolves; the view says why
 * it is closed and the write path refuses the answer.
 */
export async function resolveTokenResponder(
  orgId: string,
  rawToken: string,
  now: Date,
): Promise<{ event: Event; ownerName: string | null; responder: TokenResponder } | null> {
  const holder = await findTokenHolder(rawToken);
  if (!holder || holder.event.orgId !== orgId) return null;
  if (tokenLinkState(isTokenValid({ event: holder.event, token: holder.token, now })) === "dead") return null;

  const row = await getEventById(orgId, holder.event.id);
  if (!row) return null;

  const { memberId, externalEmail } = holder.token;
  let displayName = externalEmail ?? "";
  let memberUserId: string | null = null;

  if (memberId) {
    const [member] = await db
      .select({ firstName: tenantMembers.firstName, lastName: tenantMembers.lastName, userId: tenantMembers.userId })
      .from(tenantMembers)
      .where(eq(tenantMembers.id, memberId))
      .limit(1);
    if (!member) return null;
    displayName = getMemberDisplayName(member);
    memberUserId = member.userId;
  } else if (externalEmail) {
    const [rule] = await db
      .select({ name: eventAudience.externalName })
      .from(eventAudience)
      .where(
        and(
          eq(eventAudience.eventId, holder.event.id),
          eq(eventAudience.kind, "external"),
          sql`lower(${eventAudience.externalEmail}) = lower(${externalEmail})`,
        ),
      )
      .limit(1);
    displayName = rule?.name ?? externalEmail;
  }

  return {
    event: row.event,
    ownerName: row.ownerName,
    responder: {
      kind: "token",
      token: rawToken,
      tokenId: holder.token.id,
      memberId,
      guestEmail: externalEmail,
      displayName,
      memberUserId,
    },
  };
}

// ─── The view ───────────────────────────────────────────────────────────────

/** The responder's own row on the event; a guest has none until they answer. */
export async function getResponderResponse(
  orgId: string,
  eventId: string,
  responder: Responder,
): Promise<EventResponse | null> {
  if (responder.kind === "guest") return null;

  const owner = responseOwnerOf(responder);
  const own =
    "memberId" in owner
      ? eq(eventResponses.memberId, owner.memberId)
      : sql`lower(${eventResponses.guestEmail}) = lower(${owner.guestEmail})`;

  const [row] = await db
    .select()
    .from(eventResponses)
    .where(and(eq(eventResponses.orgId, orgId), eq(eventResponses.eventId, eventId), own))
    .limit(1);

  return row ?? null;
}

export type ResponderView = {
  event: Event;
  ownerName: string | null;
  counts: EventCounts;
  identity: SubmissionIdentity;
  /** The responder's own row, for the header's outcome line. */
  response: EventResponse | null;
  /** The event's open forms as this responder sees them. */
  forms: EventFormItem[];
  rsvp: RsvpView;
};

/**
 * Everything an RSVP surface renders for one responder on one event. The
 * caller has already located the event through its own door (`getEventDetail`
 * for members and guests, `resolveTokenResponder` for a link), so the event
 * is trusted here; this only reads what hangs off it.
 */
export async function getResponderView(
  orgId: string,
  row: { event: Event; ownerName: string | null },
  responder: Responder,
  now = new Date(),
): Promise<ResponderView> {
  const { event } = row;

  const [counts, response] = await Promise.all([
    getEventCounts(orgId, event.id),
    getResponderResponse(orgId, event.id, responder),
  ]);
  const payment = response ? await getLivePaymentForResponse(orgId, response.id) : null;

  const identity = submissionIdentityOf(responder, response?.answer ?? null);
  const forms = await listFormsForEvent(orgId, event, identity);

  const pending = selectAfterRsvpForm(forms);
  let afterRsvpForm: AfterRsvpForm | null = null;
  if (pending) {
    const data = await getFormForFiller(orgId, pending.form, event, identity);
    afterRsvpForm = {
      form: { id: data.form.id, title: data.form.title, description: data.form.description, eventId: data.form.eventId },
      questions: data.questions,
      open: data.open,
      canSubmit: data.canSubmit,
      submittedAt: data.submission?.submittedAt ?? null,
      answers: data.answers,
      prefill: data.prefill,
      required: data.form.required,
    };
  }

  return {
    event,
    ownerName: row.ownerName,
    counts,
    identity,
    response,
    forms,
    rsvp: {
      open: isRsvpOpen(event, now),
      maxGuests: event.maxGuestsPerResponse,
      priced: event.priceAmount !== null,
      eventTitle: event.title,
      payerName: responder.kind === "guest" ? null : responder.displayName,
      current: response ? { answer: response.answer, guestCount: response.guestCount, standing: response.standing } : null,
      payment,
      afterRsvpForm,
    },
  };
}
