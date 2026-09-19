import { and, eq, inArray } from "drizzle-orm";
import { forbidden } from "next/navigation";

import type { Viewer } from "@/lib/access/viewer";
import { canActOnPayment } from "@/lib/payments/scope";
import { db } from "@/server/db";
import { memberPayments } from "@/server/db/schema";
import { resolvePaymentScopeForRows } from "@/server/queries/access";
import {
  cancelPayments,
  markPaymentRefunded,
  markPaymentsPaid,
  type EventCancellationReason,
} from "@/server/lib/payment-status";

/**
 * The payment mutations behind `server/actions/payments.ts`, keyed by the
 * Viewer so they run without a request: the action adds `after()` emails and
 * nothing else.
 */

export const PAYMENT_NOT_PENDING_MESSAGE = "Only a pending or overdue payment can be changed this way.";

/**
 * Narrows `paymentIds` to those this viewer may act on, in one round trip,
 * through both doors of the payment scope (CONTEXT.md). Every id is checked —
 * checking one representative id and then trusting an org-wide guard let a
 * scoped admin smuggle out-of-scope ids through in the same array.
 */
export async function authorizePaymentIds(viewer: Viewer, paymentIds: string[]) {
  const orgId = viewer.organization.id;

  const rows = await db
    .select({
      id: memberPayments.id,
      memberId: memberPayments.memberId,
      eventId: memberPayments.eventId,
      type: memberPayments.type,
    })
    .from(memberPayments)
    .where(
      and(inArray(memberPayments.id, paymentIds), eq(memberPayments.orgId, orgId)),
    );

  const scope = await resolvePaymentScopeForRows(viewer, rows);
  const permitted = rows.filter((row) => canActOnPayment(scope, row));

  if (permitted.length === 0) {
    forbidden();
  }

  return { orgId, permittedIds: permitted.map((row) => row.id) };
}

export async function markPaymentPaid(
  viewer: Viewer,
  input: { paymentId: string; paidAt?: Date; adminNote?: string },
) {
  const { orgId } = await authorizePaymentIds(viewer, [input.paymentId]);
  const paidAt = input.paidAt ?? new Date();

  const paidIds = await markPaymentsPaid(db, {
    orgId,
    paymentIds: [input.paymentId],
    userId: viewer.user.id,
    paidAt,
    adminNote: input.adminNote,
  });
  if (paidIds.length === 0) throw new Error(PAYMENT_NOT_PENDING_MESSAGE);

  return { paidIds, paidAt };
}

export async function bulkMarkPaymentsPaid(
  viewer: Viewer,
  input: { paymentIds: string[]; paidAt?: Date; adminNote?: string },
) {
  // Every id is checked against the caller's scope, not just the first one.
  const { orgId, permittedIds } = await authorizePaymentIds(viewer, input.paymentIds);
  const paidAt = input.paidAt ?? new Date();

  const paidIds = await markPaymentsPaid(db, {
    orgId,
    paymentIds: permittedIds,
    userId: viewer.user.id,
    paidAt,
    adminNote: input.adminNote,
  });

  return { paidIds, paidAt };
}

export async function cancelPayment(
  viewer: Viewer,
  input: { paymentId: string; cancellationReason: EventCancellationReason; adminNote?: string },
) {
  const { orgId } = await authorizePaymentIds(viewer, [input.paymentId]);

  const cancelled = await cancelPayments(db, {
    orgId,
    paymentIds: [input.paymentId],
    reason: input.cancellationReason,
    adminNote: input.adminNote,
  });
  if (cancelled.length === 0) throw new Error(PAYMENT_NOT_PENDING_MESSAGE);
}

/** Closes a `refund_due` event payment once the money has gone back. */
export async function settleRefund(viewer: Viewer, input: { paymentId: string }) {
  const { orgId } = await authorizePaymentIds(viewer, [input.paymentId]);

  const updated = await markPaymentRefunded(db, {
    orgId,
    paymentId: input.paymentId,
    userId: viewer.user.id,
  });
  if (!updated) throw new Error("Only a payment marked as refund due can be settled.");
}
