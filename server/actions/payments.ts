"use server";

import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { z } from "zod";

import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { memberPayments } from "@/server/db/schema";
import { canActOnPayment } from "@/lib/payments/scope";
import {
  requireAdminAccess,
  requireOrganization,
  resolvePaymentScopeForRows,
} from "@/server/queries/access";
import { generateMembershipPayments } from "@/server/lib/payment-lifecycle";
import {
  EVENT_CANCELLATION_REASONS,
  cancelPayments,
  markPaymentRefunded,
  markPaymentsPaid,
  sendPaymentConfirmedEmail,
} from "@/server/lib/payment-status";

export type { CancellationReason, EventCancellationReason } from "@/server/lib/payment-status";

const PAYMENT_NOT_PENDING_MESSAGE = "Only a pending or overdue payment can be changed this way.";

/**
 * Narrows `paymentIds` to those this viewer may act on, in one round trip,
 * through both doors of the payment scope (CONTEXT.md). Every id is checked —
 * checking one representative id and then trusting an org-wide guard let a
 * scoped admin smuggle out-of-scope ids through in the same array.
 */
async function authorizePaymentIds(userId: string, paymentIds: string[]) {
  const organization = await requireOrganization();
  const orgId = organization.id;

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

  const scope = await resolvePaymentScopeForRows(userId, rows);
  const permitted = rows.filter((row) => canActOnPayment(scope, row));

  if (permitted.length === 0) {
    forbidden();
  }

  return { orgId, permittedIds: permitted.map((row) => row.id) };
}

async function resolvePaymentAccess(userId: string, paymentId: string) {
  const { orgId } = await authorizePaymentIds(userId, [paymentId]);
  return { orgId };
}

export const generatePaymentsAction = orgAdminActionClient
  .metadata({ actionName: "generatePayments" })
  .inputSchema(z.object({}).optional())
  .action(async () => {
    await requireAdminAccess();
    const result = await generateMembershipPayments();
    return result;
  });

export const markPaymentPaidAction = authActionClient
  .metadata({ actionName: "markPaymentPaid" })
  .inputSchema(
    z.object({
      paymentId: z.string(),
      paidAt: z.string().datetime().optional(),
      adminNote: z.string().max(500).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { orgId } = await resolvePaymentAccess(ctx.auth.user.id, parsedInput.paymentId);

    const paidAt = parsedInput.paidAt ? new Date(parsedInput.paidAt) : new Date();

    const paidIds = await markPaymentsPaid(db, {
      orgId,
      paymentIds: [parsedInput.paymentId],
      userId: ctx.auth.user.id,
      paidAt,
      adminNote: parsedInput.adminNote,
    });
    if (paidIds.length === 0) throw new Error(PAYMENT_NOT_PENDING_MESSAGE);

    after(async () => {
      for (const id of paidIds) await sendPaymentConfirmedEmail(id, paidAt);
    });

    return { success: true };
  });

export const cancelPaymentAction = authActionClient
  .metadata({ actionName: "cancelPayment" })
  .inputSchema(
    z.object({
      paymentId: z.string(),
      cancellationReason: z.enum(EVENT_CANCELLATION_REASONS),
      adminNote: z.string().max(500).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { orgId } = await resolvePaymentAccess(ctx.auth.user.id, parsedInput.paymentId);

    const cancelled = await cancelPayments(db, {
      orgId,
      paymentIds: [parsedInput.paymentId],
      reason: parsedInput.cancellationReason,
      adminNote: parsedInput.adminNote,
    });
    if (cancelled.length === 0) throw new Error(PAYMENT_NOT_PENDING_MESSAGE);

    return { success: true };
  });

export const bulkMarkPaymentsPaidAction = authActionClient
  .metadata({ actionName: "bulkMarkPaymentsPaid" })
  .inputSchema(
    z.object({
      paymentIds: z.array(z.string()).min(1).max(500),
      paidAt: z.string().datetime().optional(),
      adminNote: z.string().max(500).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    // Every id is checked against the caller's scope, not just the first one.
    const { orgId, permittedIds } = await authorizePaymentIds(
      ctx.auth.user.id,
      parsedInput.paymentIds,
    );

    const paidAt = parsedInput.paidAt ? new Date(parsedInput.paidAt) : new Date();

    const paidIds = await markPaymentsPaid(db, {
      orgId,
      paymentIds: permittedIds,
      userId: ctx.auth.user.id,
      paidAt,
      adminNote: parsedInput.adminNote,
    });

    after(async () => {
      for (const id of paidIds) {
        await sendPaymentConfirmedEmail(id, paidAt);
      }
    });

    return {
      updated: paidIds.length,
      // Ids outside the caller's scope, already paid, or cancelled.
      skipped: parsedInput.paymentIds.length - paidIds.length,
    };
  });

/** Closes a `refund_due` event payment once the money has gone back. */
export const markPaymentRefundedAction = authActionClient
  .metadata({ actionName: "markPaymentRefunded" })
  .inputSchema(z.object({ paymentId: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const { orgId } = await resolvePaymentAccess(ctx.auth.user.id, parsedInput.paymentId);

    const updated = await markPaymentRefunded(db, {
      orgId,
      paymentId: parsedInput.paymentId,
      userId: ctx.auth.user.id,
    });
    if (!updated) throw new Error("Only a payment marked as refund due can be settled.");

    return { success: true };
  });
