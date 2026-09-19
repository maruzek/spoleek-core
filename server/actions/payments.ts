"use server";

import { after } from "next/server";
import { z } from "zod";

import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { generateMembershipPayments } from "@/server/lib/payment-lifecycle";
import {
  bulkMarkPaymentsPaid,
  cancelPayment,
  markPaymentPaid,
  settleRefund,
} from "@/server/lib/payment-actions";
import { EVENT_CANCELLATION_REASONS, sendPaymentConfirmedEmail } from "@/server/lib/payment-status";

export type { CancellationReason, EventCancellationReason } from "@/server/lib/payment-status";

export const generatePaymentsAction = orgAdminActionClient
  .metadata({ actionName: "generatePayments" })
  .inputSchema(z.object({}).optional())
  .action(async () => {
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
    const { paidIds, paidAt } = await markPaymentPaid(ctx.viewer, {
      paymentId: parsedInput.paymentId,
      paidAt: parsedInput.paidAt ? new Date(parsedInput.paidAt) : undefined,
      adminNote: parsedInput.adminNote,
    });

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
    await cancelPayment(ctx.viewer, parsedInput);
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
    const { paidIds, paidAt } = await bulkMarkPaymentsPaid(ctx.viewer, {
      paymentIds: parsedInput.paymentIds,
      paidAt: parsedInput.paidAt ? new Date(parsedInput.paidAt) : undefined,
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
    await settleRefund(ctx.viewer, parsedInput);
    return { success: true };
  });
