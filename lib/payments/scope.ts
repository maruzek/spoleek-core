/**
 * Payment scope — see CONTEXT.md.
 *
 * One value describes what a viewer may see and act on in the payments
 * dashboard. `"full"` is unrestricted. Otherwise each axis is an allowlist,
 * and an empty allowlist means *nothing on that axis* — never "no filter".
 * Rows are member-keyed (`membership_fee`) or event-keyed (`event`); the DB
 * check constraint on `member_payments` guarantees exactly one applies.
 */
export type PaymentScope =
  | "full"
  | {
      /** Members whose membership-fee payments are in scope. */
      memberIds: readonly string[];
      /** Events whose event payments are in scope. */
      eventIds: readonly string[];
    };

export type ScopedPaymentRow = {
  type: "membership_fee" | "event";
  memberId: string | null;
  eventId: string | null;
};

export const EMPTY_PAYMENT_SCOPE: Exclude<PaymentScope, "full"> = {
  memberIds: [],
  eventIds: [],
};

function memberInScope(scope: Exclude<PaymentScope, "full">, row: ScopedPaymentRow) {
  return row.memberId !== null && scope.memberIds.includes(row.memberId);
}

function eventInScope(scope: Exclude<PaymentScope, "full">, row: ScopedPaymentRow) {
  return row.eventId !== null && scope.eventIds.includes(row.eventId);
}

/**
 * Visibility: may the viewer see this payment? The dashboard list mirrors
 * this in SQL. Event rows are visible on both axes — through the event the
 * viewer manages, or through the responder being one of their members.
 */
export function paymentInScope(
  scope: PaymentScope,
  row: ScopedPaymentRow,
): boolean {
  if (scope === "full") return true;
  if (row.type === "membership_fee") return memberInScope(scope, row);
  return eventInScope(scope, row) || memberInScope(scope, row);
}

/**
 * Mutation: may the viewer mark paid / cancel / refund this payment? Narrower
 * than visibility: an event payment is acted on only by whoever manages the
 * event, even when the responder is one of the viewer's members — the money
 * belongs to the event's organiser, not the member's group.
 */
export function canActOnPayment(
  scope: PaymentScope,
  row: ScopedPaymentRow,
): boolean {
  if (scope === "full") return true;
  if (row.type === "membership_fee") return memberInScope(scope, row);
  return eventInScope(scope, row);
}
