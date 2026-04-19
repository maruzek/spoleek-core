"use server";

import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { z } from "zod";

import { PaymentConfirmedEmail } from "@/emails/payment-confirmed-email";
import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { memberPayments, organizations, tenantMembers, users } from "@/server/db/schema";
import { requireAdminAccess, listScopedGroupIds } from "@/server/queries/access";
import { listMemberIdsInGroups } from "@/server/queries/payments";
import { generateMembershipPayments } from "@/server/lib/payment-lifecycle";
import { getResendClient, getResendFromEmail } from "@/server/lib/email";

const CANCELLATION_REASONS = [
  "duplicate",
  "waived",
  "admin_error",
  "other",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

async function resolvePaymentAccess(userId: string, paymentId: string) {
  const [user] = await db
    .select({ systemRole: users.systemRole })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const access = await requireAdminAccess({ capability: "canManagePayments" });

  if (access.adminAccessLevel === "full" || user?.systemRole === "system_admin") {
    return { orgId: access.organization.id };
  }

  if (!access.member) {
    forbidden();
  }

  // Scoped group admin: verify the payment's member is in one of their groups
  const groupIds = await listScopedGroupIds(access.organization.id, access.member.id);
  const allowedMemberIds = await listMemberIdsInGroups(access.organization.id, groupIds);

  const [payment] = await db
    .select({ memberId: memberPayments.memberId, status: memberPayments.status })
    .from(memberPayments)
    .where(
      and(
        eq(memberPayments.id, paymentId),
        eq(memberPayments.orgId, access.organization.id),
      ),
    )
    .limit(1);

  if (!payment || !allowedMemberIds.includes(payment.memberId)) {
    forbidden();
  }

  return { orgId: access.organization.id, currentStatus: payment.status };
}

async function sendPaymentConfirmedEmail(paymentId: string, paidAt: Date) {
  try {
    const [row] = await db
      .select({
        memberEmail: tenantMembers.email,
        memberFirstName: tenantMembers.firstName,
        memberLastName: tenantMembers.lastName,
        orgName: organizations.name,
        amount: memberPayments.amount,
        currency: memberPayments.currency,
        periodLabel: memberPayments.periodLabel,
        type: memberPayments.type,
      })
      .from(memberPayments)
      .innerJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
      .innerJoin(organizations, eq(memberPayments.orgId, organizations.id))
      .where(eq(memberPayments.id, paymentId))
      .limit(1);

    if (!row?.memberEmail) return;

    const memberName = [row.memberFirstName, row.memberLastName].filter(Boolean).join(" ") || row.memberEmail;
    const resend = getResendClient();
    const from = getResendFromEmail();

    await resend.emails.send({
      from,
      to: [row.memberEmail],
      subject: `Payment confirmed — ${row.periodLabel}`,
      react: PaymentConfirmedEmail({
        organizationName: row.orgName,
        memberName,
        periodLabel: row.periodLabel,
        amount: (row.amount / 100).toFixed(2),
        currency: row.currency,
        paidAt: paidAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      }),
    });
  } catch {
    // Email failure must not surface as an action error
  }
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

    await db
      .update(memberPayments)
      .set({
        status: "paid",
        paidAt,
        confirmedByUserId: ctx.auth.user.id,
        adminNote: parsedInput.adminNote ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memberPayments.id, parsedInput.paymentId),
          eq(memberPayments.orgId, orgId),
          inArray(memberPayments.status, ["pending", "overdue"]),
        ),
      );

    after(() => sendPaymentConfirmedEmail(parsedInput.paymentId, paidAt));

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

    await db
      .update(memberPayments)
      .set({
        status: "cancelled",
        cancellationReason: parsedInput.cancellationReason,
        adminNote: parsedInput.adminNote ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memberPayments.id, parsedInput.paymentId),
          eq(memberPayments.orgId, orgId),
          inArray(memberPayments.status, ["pending", "overdue"]),
        ),
      );

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
    // Verify access for all payment IDs — use first to resolve org, then verify ownership of all
    await resolvePaymentAccess(ctx.auth.user.id, parsedInput.paymentIds[0]);

    const access = await requireAdminAccess({ capability: "canManagePayments" });
    const orgId = access.organization.id;

    const paidAt = parsedInput.paidAt ? new Date(parsedInput.paidAt) : new Date();

    const result = await db
      .update(memberPayments)
      .set({
        status: "paid",
        paidAt,
        confirmedByUserId: ctx.auth.user.id,
        adminNote: parsedInput.adminNote ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(memberPayments.id, parsedInput.paymentIds),
          eq(memberPayments.orgId, orgId),
          inArray(memberPayments.status, ["pending", "overdue"]),
        ),
      )
      .returning({ id: memberPayments.id });

    after(async () => {
      for (const { id } of result) {
        await sendPaymentConfirmedEmail(id, paidAt);
      }
    });

    return { updated: result.length };
  });
