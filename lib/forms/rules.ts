import type {
  EventRsvpAnswer,
  EventStatus,
  FormStatus,
  FormTiming,
} from "@/server/db/schema";
import { eventEndInstant } from "@/lib/events/rsvp";

/**
 * Form rules as pure functions over already-loaded rows.
 *
 * Same contract as `lib/events/rsvp.ts`: the query and action layers load the
 * form, its event and the viewer's standing, then ask these functions. No
 * database, so every timing edge case is a table test.
 */

/** The slice of `forms` the rules need. */
export type RuleForm = {
  status: FormStatus;
  timing: FormTiming;
  required: boolean;
  onlyRsvpYes: boolean;
  closesAt: Date | null;
  eventId: string | null;
};

/** The slice of `events` the rules need. Null when the form is unlinked. */
export type RuleEvent = {
  status: EventStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  deletedAt?: Date | null;
};

export type FormClosedReason =
  | "draft"
  | "closed"
  | "deadline_passed"
  | "event_cancelled"
  | "event_deleted";

export type FormOpenResult =
  | { open: true }
  | { open: false; reason: FormClosedReason };

/**
 * Who is looking at the form, reduced to what the rules need.
 *
 * `eligible` for a member is the caller's answer to "may this member view and
 * RSVP to the event / is this member in the form's audience" — it is computed
 * from the audience rules by `lib/events/eligibility.ts`, not here.
 * `rsvpAnswer` is the viewer's own RSVP on the linked event, if any.
 */
export type FormViewer =
  | { kind: "member"; eligible: boolean; rsvpAnswer: EventRsvpAnswer | null }
  | { kind: "token"; rsvpAnswer: EventRsvpAnswer | null }
  | { kind: "guest"; rsvpAnswer?: EventRsvpAnswer | null };

export type CanSubmitReason = "FORM_CLOSED" | "NOT_ELIGIBLE" | "RSVP_REQUIRED";

export type CanSubmitResult =
  | { ok: true }
  | { ok: false; reason: CanSubmitReason };

/**
 * Where the form is surfaced right now.
 *
 * - `inline_after_rsvp` — under the RSVP control once answered, and as a
 *   pending card.
 * - `pending` — as a pending card: this is the window the form is meant for,
 *   so badges and reminders nag.
 * - `listed` — in the event's "Forms" block only; still submittable, but
 *   outside its window, so nothing nags for it.
 */
export type FormPlacement = "inline_after_rsvp" | "pending" | "listed";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether submissions are accepted right now.
 *
 * Reasons are ordered by how much they explain: the form's own status
 * overrides everything, a dead event overrides a deadline, and a deadline is
 * the useful message when the rest is fine.
 */
export function isFormOpen(
  form: Pick<RuleForm, "status" | "closesAt">,
  event: RuleEvent | null,
  now: Date,
): FormOpenResult {
  if (form.status === "draft") return { open: false, reason: "draft" };
  if (form.status === "closed") return { open: false, reason: "closed" };

  if (event) {
    if (event.deletedAt) return { open: false, reason: "event_deleted" };
    if (event.status === "cancelled") {
      return { open: false, reason: "event_cancelled" };
    }
  }

  if (form.closesAt && now > form.closesAt) {
    return { open: false, reason: "deadline_passed" };
  }

  return { open: true };
}

/**
 * Placement per `timing`. Never blocks submission.
 *
 * The chosen reading of "the window": `before_event` stops nagging at
 * `startsAt` (the bus has left; a transport form is now noise), `after_event`
 * does not nag before the event is over (an evaluation of something that has
 * not happened yet), `during_event` nags from `startsAt` on with no upper
 * bound (a manager closes it). A form without an event or on an event
 * without dates has no window and behaves as `anytime`; `after_rsvp` is the
 * exception, since an RSVP needs no dates.
 */
export function getFormPlacement(
  form: Pick<RuleForm, "timing">,
  event: RuleEvent | null,
  now: Date,
): FormPlacement {
  if (form.timing === "after_rsvp") {
    return event ? "inline_after_rsvp" : "pending";
  }

  const start = event?.startsAt ?? null;
  const end = event ? eventEndInstant(event) : null;
  if (!start || !end) return "pending";

  switch (form.timing) {
    case "before_event":
      return now < start ? "pending" : "listed";
    case "during_event":
      return now >= start ? "pending" : "listed";
    case "after_event":
      return now > end ? "pending" : "listed";
    case "anytime":
      return "pending";
  }
}

/**
 * Open ∧ eligible through the viewer's channel.
 *
 * A token or a guest can only reach a form through an event: unlinked forms
 * live in the portal alone. `onlyRsvpYes` is enforced only when there is an
 * event to have answered.
 */
export function canSubmit(params: {
  form: Pick<RuleForm, "status" | "closesAt" | "onlyRsvpYes" | "eventId">;
  event: RuleEvent | null;
  viewer: FormViewer;
  now: Date;
}): CanSubmitResult {
  const { form, event, viewer, now } = params;

  if (!isFormOpen(form, event, now).open) {
    return { ok: false, reason: "FORM_CLOSED" };
  }

  if (viewer.kind === "member") {
    if (!viewer.eligible) return { ok: false, reason: "NOT_ELIGIBLE" };
  } else if (!form.eventId || !event) {
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }

  if (form.eventId && event && form.onlyRsvpYes && viewer.rsvpAnswer !== "yes") {
    return { ok: false, reason: "RSVP_REQUIRED" };
  }

  return { ok: true };
}

/**
 * Required ∧ can submit ∧ not yet submitted. Drives badges, the manager's
 * pending list and reminder recipients. Placement is deliberately not part
 * of it: a required form outside its window is still owed, only not nagged
 * for on the event page.
 */
export function isPending(params: {
  form: Pick<RuleForm, "status" | "closesAt" | "onlyRsvpYes" | "eventId" | "required">;
  event: RuleEvent | null;
  viewer: FormViewer;
  hasSubmission: boolean;
  now: Date;
}): boolean {
  const { form, hasSubmission } = params;
  if (!form.required || hasSubmission) return false;
  return canSubmit(params).ok;
}

/**
 * The instant a question's TTL counts from: the event's end (else start), or
 * `closesAt` for an unlinked form. Null means the question is never shredded
 * and the editor warns about it.
 */
export function getShredAnchor(
  form: Pick<RuleForm, "closesAt">,
  event: Pick<RuleEvent, "startsAt" | "endsAt"> | null,
): Date | null {
  if (event) return eventEndInstant(event);
  return form.closesAt;
}

export function isShredDue(
  question: { shredAfterEventDays: number | null },
  anchor: Date | null,
  now: Date,
): boolean {
  if (question.shredAfterEventDays === null || !anchor) return false;
  return anchor.getTime() + question.shredAfterEventDays * DAY_MS < now.getTime();
}
