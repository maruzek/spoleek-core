import type {
  Event,
  EventResponse,
  MemberPayment,
  MemberPaymentStatus,
} from "@/server/db/schema";

/**
 * Event payment rules as pure functions over already-loaded rows, in the
 * same spirit as `rsvp.ts`: the action layer loads the event, the response
 * and the live payment (under `FOR UPDATE`) and asks these functions what to
 * do. Nothing here touches the database, so every cell of the decision table
 * is testable without a Postgres.
 */

/** The slice of `events` the rules need. */
export type PricedEvent = Pick<
  Event,
  | "priceAmount"
  | "priceCurrency"
  | "priceBankAccount"
  | "paymentDueAt"
  | "rsvpDeadlineAt"
  | "startsAt"
  | "title"
>;

/** The response as it now stands; `null` means it was deleted. */
export type PlanResponse = Pick<
  EventResponse,
  "answer" | "standing" | "guestCount"
> | null;

/** The live payment row for the response, or `null` when there is none. */
export type LivePayment = Pick<MemberPayment, "status" | "amount"> | null;

/** What the portal card and the response list need of a live payment. */
export type EventPaymentView = Pick<
  MemberPayment,
  | "id"
  | "status"
  | "amount"
  | "currency"
  | "bankAccount"
  | "variableSymbol"
  | "periodLabel"
  | "dueAt"
  | "paidAt"
>;

export type PaymentPlan =
  | { kind: "create"; amount: number }
  | { kind: "reprice"; amount: number }
  | { kind: "cancel" }
  | { kind: "refund_due" }
  | { kind: "noop" };

/** When no due date, deadline or start exists, the payment is due this many days out. */
export const EVENT_PAYMENT_DEFAULT_DUE_DAYS = 14;

/**
 * A live row is one the RSVP still owns. Cancelled rows are history: a later
 * confirmed yes creates a fresh payment rather than reviving the old one.
 */
export function isLivePayment(status: MemberPaymentStatus): boolean {
  return (
    status === "pending" ||
    status === "overdue" ||
    status === "paid" ||
    status === "refund_due"
  );
}

/**
 * Paid and refund-due rows are frozen: the money has moved (or is owed back),
 * so nothing automatic may re-price or cancel them.
 */
function isSettled(status: MemberPaymentStatus): boolean {
  return status === "paid" || status === "refund_due";
}

/** One price per person: the responder plus every guest they bring. */
export function eventPaymentAmount(
  event: Pick<PricedEvent, "priceAmount">,
  response: Pick<EventResponse, "guestCount">,
): number {
  return (event.priceAmount ?? 0) * (1 + response.guestCount);
}

function owesPayment(event: PricedEvent, response: PlanResponse): boolean {
  return (
    event.priceAmount !== null &&
    response !== null &&
    response.answer === "yes" &&
    response.standing === "confirmed"
  );
}

/**
 * The decision table from the spec. "Owes" means a confirmed yes on a priced
 * event.
 *
 * | Response state          | No live row | Pending / overdue row     | Paid / refund_due row |
 * | owes                    | create      | reprice if amount differs | noop                  |
 * | reserve / no / maybe    | noop        | cancel                    | refund_due            |
 * | response deleted        | noop        | cancel                    | refund_due            |
 * | event unpriced          | noop        | cancel                    | noop                  |
 *
 * A paid row whose guest count later grows is left alone on purpose: paid
 * rows are frozen and the difference is the manager's call, not a second
 * automatic charge on somebody who already settled up.
 */
export function planEventPayment(params: {
  event: PricedEvent;
  response: PlanResponse;
  current: LivePayment;
}): PaymentPlan {
  const { event, response, current } = params;

  if (owesPayment(event, response)) {
    const amount = eventPaymentAmount(event, response!);
    if (current === null) return { kind: "create", amount };
    if (isSettled(current.status)) return { kind: "noop" };
    return current.amount === amount ? { kind: "noop" } : { kind: "reprice", amount };
  }

  if (current === null) return { kind: "noop" };
  if (isSettled(current.status)) {
    // The price was removed from the event: whoever paid still came, so the
    // organiser decides whether to refund — nothing is flagged automatically.
    if (event.priceAmount === null) return { kind: "noop" };
    if (current.status === "refund_due") return { kind: "noop" };
    return { kind: "refund_due" };
  }
  return { kind: "cancel" };
}

/**
 * The bank account and due date stamped onto a new payment row. Existing rows
 * keep what their QR already said; these fallbacks apply to creation only.
 */
export function resolveEventPaymentDetails(params: {
  event: Pick<PricedEvent, "priceBankAccount" | "paymentDueAt" | "rsvpDeadlineAt" | "startsAt">;
  orgBankAccount: string | null;
  now: Date;
}): { bankAccount: string | null; dueAt: Date } {
  const { event, orgBankAccount, now } = params;
  const bankAccount = event.priceBankAccount ?? orgBankAccount ?? null;
  const dueAt =
    event.paymentDueAt ??
    event.rsvpDeadlineAt ??
    event.startsAt ??
    new Date(now.getTime() + EVENT_PAYMENT_DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000);
  return { bankAccount, dueAt };
}
