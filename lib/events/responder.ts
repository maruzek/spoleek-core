import type { EventPaymentView } from "@/lib/events/payment-plan";
import type { RsvpOpenResult, isTokenValid } from "@/lib/events/rsvp";
import type { CanSubmitResult, FormOpenResult } from "@/lib/forms/rules";
import type { CustomFieldValue, EventRsvpAnswer, EventRsvpStanding, Form } from "@/server/db/schema";
import type { SubmissionIdentity } from "@/server/lib/forms/submissions";
import type { EventFormItem, FillerQuestion } from "@/server/queries/forms";

/**
 * The person answering an event, as the RSVP surfaces see them (see
 * CONTEXT.md → Responder). Three doors produce one:
 *
 * - `member` — the signed-in member, from the Viewer.
 * - `token` — the holder of a personal link: a member row (shadow or
 *   not-yet-activated accounts) or an external email from the audience.
 * - `guest` — nobody yet: an anonymous visitor on a public event who
 *   identifies themselves in the form they submit.
 *
 * Everything after the door — the event view, the row key an answer is
 * written under, the identity a form submission is stored against — is a
 * pure function of this value. Nothing here touches the database.
 */
export type Responder =
  | { kind: "member"; memberId: string; displayName: string }
  | {
      kind: "token";
      /** The raw link, for the client to call the token actions with. */
      token: string;
      tokenId: string;
      memberId: string | null;
      guestEmail: string | null;
      /** Member display name, or the audience rule's name, or the email. */
      displayName: string;
      /** The member's sign-in account, when the holder is a member who has one. */
      memberUserId: string | null;
    }
  | { kind: "guest" };

/** A Responder whose answer has a row of its own: everyone but the anonymous guest. */
export type IdentifiedResponder = Exclude<Responder, { kind: "guest" }>;

/**
 * The key `upsertResponse` writes under. A member's row is keyed by member,
 * an external holder's by lower-cased email; a guest's key comes from the
 * form they type into, so there is nothing to derive here.
 */
export function responseOwnerOf(
  responder: IdentifiedResponder,
): { memberId: string } | { guestEmail: string; guestName: string } {
  if (responder.kind === "member") return { memberId: responder.memberId };
  if (responder.memberId) return { memberId: responder.memberId };
  return { guestEmail: responder.guestEmail!, guestName: responder.displayName };
}

/**
 * The identity a form submission is stored against. A member who can see
 * the event is eligible for its forms by construction — the event's
 * eligibility already gated the page — so `eligible` is not re-derived.
 */
export function submissionIdentityOf(
  responder: Responder,
  rsvpAnswer: EventRsvpAnswer | null,
): SubmissionIdentity {
  switch (responder.kind) {
    case "member":
      return { kind: "member", memberId: responder.memberId, eligible: true, rsvpAnswer };
    case "token":
      return {
        kind: "token",
        memberId: responder.memberId,
        guestEmail: responder.guestEmail,
        guestName: responder.displayName,
        rsvpAnswer,
      };
    case "guest":
      // No email yet, so no existing submission to find; the action upserts
      // by the address the guest types in.
      return { kind: "guest", guestEmail: "", guestName: "", rsvpAnswer: null };
  }
}

/**
 * What a personal link is worth right now. `dead` links get the invalid
 * page and the token actions refuse them; a `closed` link still shows the
 * event so the holder can see why (deadline passed, event over, cancelled).
 */
export type TokenLinkState = "open" | "closed" | "dead";

export function tokenLinkState(valid: ReturnType<typeof isTokenValid>): TokenLinkState {
  if (valid.open) return "open";
  switch (valid.reason) {
    case "token_expired":
    case "event_deleted":
    case "draft":
      return "dead";
    default:
      return "closed";
  }
}

/**
 * The one `after_rsvp` form to prompt for in a dialog the moment the
 * invitation is answered — and on every load while a required one is still
 * pending. Only open forms reach a responder's list, and a form they have
 * already submitted is never prompted for again. Same rule on every surface.
 */
export function selectAfterRsvpForm<T extends Pick<EventFormItem, "placement" | "submittedAt">>(
  forms: readonly T[],
): T | null {
  return forms.find((item) => item.placement === "inline_after_rsvp" && item.submittedAt == null) ?? null;
}

// ─── The client's slice ─────────────────────────────────────────────────────

/** The pending `after_rsvp` form, ready for the filler. `prefill` is empty off the portal. */
export type AfterRsvpForm = {
  form: Pick<Form, "id" | "title" | "description" | "eventId">;
  questions: FillerQuestion[];
  open: FormOpenResult;
  canSubmit: CanSubmitResult;
  submittedAt: Date | null;
  answers: Record<string, CustomFieldValue>;
  prefill: Record<string, CustomFieldValue>;
  required: boolean;
};

/** What the RSVP control renders: one shape for the member, token and guest doors. */
export type RsvpView = {
  open: RsvpOpenResult;
  maxGuests: number;
  priced: boolean;
  eventTitle: string;
  /** Who the payment is for; null for an anonymous guest. */
  payerName: string | null;
  /** The responder's own answer, or null (always null for a guest). */
  current: { answer: EventRsvpAnswer; guestCount: number; standing: EventRsvpStanding } | null;
  /** The live payment for the current answer, when the event charges. */
  payment: EventPaymentView | null;
  afterRsvpForm: AfterRsvpForm | null;
};
