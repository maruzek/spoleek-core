"use server";

import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { z } from "zod";

import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { memberPayments, users } from "@/server/db/schema";
import { requireAdminAccess, listScopedGroupIds } from "@/server/queries/access";
import { listMemberIdsInGroups } from "@/server/queries/payments";
import { generateMembershipPayments } from "@/server/lib/payment-lifecycle";
import {
  CANCELLATION_REASONS,
  cancelPayments,
  markPaymentRefunded,
  markPaymentsPaid,
  sendPaymentConfirmedEmail,
} from "@/server/lib/payment-status";

export type { CancellationReason } from "@/server/lib/payment-status";

/**
 * Resolves what this admin may touch.
 *
 * `allowedMemberIds` is null for a full org admin (or system admin) and an
 * explicit allowlist for a scoped group admin. Callers acting on many payments
 * must intersect against it — checking one representative id and then trusting
 * an org-wide guard let a scoped admin smuggle out-of-scope ids through in the
 * same array.
 */
async function resolvePaymentScope(userId: string) {
  const [user] = await db
    .select({ systemRole: users.systemRole })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const access = await requireAdminAccess({ capability: "canManagePayments" });
  const orgId = access.organization.id;

  if (access.adminAccessLevel === "full" || user?.systemRole === "system_admin") {
    return { orgId, allowedMemberIds: null as string[] | null };
  }

  if (!access.member) {
    forbidden();
  }

  const groupIds = await listScopedGroupIds(orgId, access.member.id);
  const allowedMemberIds = await listMemberIdsInGroups(orgId, groupIds);

  return { orgId, allowedMemberIds };
}

/**
 * Narrows `paymentIds` to those this admin may act on, in one round trip.
 *
 * A scoped group admin sees their members' membership fees only: event
 * payments (including guest rows, which have no member) are managed through
 * the event's response list by whoever manages the event.
 */
async function authorizePaymentIds(userId: string, paymentIds: string[]) {
  const { orgId, allowedMemberIds } = await resolvePaymentScope(userId);

  const rows = await db
    .select({
      id: memberPayments.id,
      memberId: memberPayments.memberId,
      type: memberPayments.type,
    })
    .from(memberPayments)
    .where(
      and(inArray(memberPayments.id, paymentIds), eq(memberPayments.orgId, orgId)),
    );

  const permitted =
    allowedMemberIds === null
      ? rows
      : rows.filter(
          (row) =>
            row.type === "membership_fee" &&
            row.memberId !== null &&
            allowedMemberIds.includes(row.memberId),
        );

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
      cancellationReason: z.enum(CANCELLATION_REASONS),
      adminNote: z.string().max(500).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { orgId } = await resolvePaymentAccess(ctx.auth.user.id, parsedInput.paymentId);

    await cancelPayments(db, {
      orgId,
      paymentIds: [parsedInput.paymentId],
      reason: parsedInput.cancellationReason,
      adminNote: parsedInput.adminNote,
    });

    return { success: true };
  });

export const bulkMarkPaymentsPaidAction = authActionClient
  .metadata({ actionName: "bulkMarkPaymentsPaid" })
  .inputSchema(
    z.object({
      paymentIds: z.array(z.string()).min(1).max(200),
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

/**
 * Closes a `refund_due` event payment once the money has gone back. Only full
 * org admins reach event rows through this door (see `authorizePaymentIds`).
 */
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

    return { success: updated };
  });
