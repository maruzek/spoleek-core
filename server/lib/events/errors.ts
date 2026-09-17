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
  | "NOT_FOUND"
  /** Publishing or charging a priced event with no bank account anywhere. */
  | "PAYMENT_BANK_ACCOUNT_MISSING"
  /** Mark paid / cancel on a row that is not pending or overdue. */
  | "PAYMENT_NOT_PENDING"
  /** Mark refunded on a row that is not refund_due. */
  | "PAYMENT_NOT_PAID";

export class EventError extends Error {
  constructor(public readonly code: EventErrorCode) {
    super(code);
    this.name = "EventError";
  }
}
