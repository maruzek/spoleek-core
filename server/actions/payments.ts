"use server";

import { and, eq, inArray } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { z } from "zod";

import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { memberPayments, users } from "@/server/db/schema";
import { requireAdminAccess, listScopedGroupIds } from "@/server/queries/access";
import { listMemberIdsInGroups } from "@/server/queries/payments";
import { generateMembershipPayments } from "@/server/lib/payment-lifecycle";

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
    .select({ memberId: memberPayments.memberId })
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

  return { orgId: access.organization.id };
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
  .inputSchema(z.object({ paymentId: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const { orgId } = await resolvePaymentAccess(ctx.auth.user.id, parsedInput.paymentId);

    await db
      .update(memberPayments)
      .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(memberPayments.id, parsedInput.paymentId),
          eq(memberPayments.orgId, orgId),
          inArray(memberPayments.status, ["pending", "overdue"]),
        ),
      );

    return { success: true };
  });

export const cancelPaymentAction = authActionClient
  .metadata({ actionName: "cancelPayment" })
  .inputSchema(z.object({ paymentId: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const { orgId } = await resolvePaymentAccess(ctx.auth.user.id, parsedInput.paymentId);

    await db
      .update(memberPayments)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(memberPayments.id, parsedInput.paymentId),
          eq(memberPayments.orgId, orgId),
          inArray(memberPayments.status, ["pending", "overdue"]),
        ),
      );

    return { success: true };
  });
