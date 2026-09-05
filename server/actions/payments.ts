"use server";

import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { z } from "zod";

import { PaymentConfirmedEmail } from "@/emails/payment-confirmed-email";
import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { feeAmountToDecimal } from "@/lib/payments";
import { db } from "@/server/db";
import { memberPayments, organizations, tenantMembers, users } from "@/server/db/schema";
import { requireAdminAccess, listScopedGroupIds } from "@/server/queries/access";
import { listMemberIdsInGroups } from "@/server/queries/payments";
import { generateMembershipPayments } from "@/server/lib/payment-lifecycle";
import { getResendClient, getResendFromEmail } from "@/server/lib/email";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";

const CANCELLATION_REASONS = [
  "duplicate",
  "waived",
  "admin_error",
  "other",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

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

/** Narrows `paymentIds` to those this admin may act on, in one round trip. */
async function authorizePaymentIds(userId: string, paymentIds: string[]) {
  const { orgId, allowedMemberIds } = await resolvePaymentScope(userId);

  const rows = await db
    .select({ id: memberPayments.id, memberId: memberPayments.memberId })
    .from(memberPayments)
    .where(
      and(inArray(memberPayments.id, paymentIds), eq(memberPayments.orgId, orgId)),
    );

  const permitted =
    allowedMemberIds === null
      ? rows
      : rows.filter((row) => allowedMemberIds.includes(row.memberId));

  if (permitted.length === 0) {
    forbidden();
  }

  return { orgId, permittedIds: permitted.map((row) => row.id) };
}

async function resolvePaymentAccess(userId: string, paymentId: string) {
  const { orgId } = await authorizePaymentIds(userId, [paymentId]);
  return { orgId };
}

async function sendPaymentConfirmedEmail(paymentId: string, paidAt: Date) {
  try {
    const [row] = await db
      .select({
        memberEmail: tenantMembers.email,
        memberWorkspaceEmail: tenantMembers.workspaceUserEmail,
        memberPreferredEmail: tenantMembers.preferredEmail,
        memberFirstName: tenantMembers.firstName,
        memberLastName: tenantMembers.lastName,
        orgName: organizations.name,
        emailNotifyPaymentConfirmed: organizations.emailNotifyPaymentConfirmed,
        defaultEmailPreference: organizations.defaultEmailPreference,
        workspaceModuleEnabled: organizations.workspaceModuleEnabled,
        workspaceConnectedAt: organizations.workspaceConnectedAt,
        workspaceDomain: organizations.workspaceDomain,
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

    if (!row || !row.emailNotifyPaymentConfirmed) return;

    const toEmail = resolveMemberEmailForOrg({
      member: {
        email: row.memberEmail,
        workspaceUserEmail: row.memberWorkspaceEmail,
        preferredEmail: row.memberPreferredEmail,
      },
      organization: {
        defaultEmailPreference: row.defaultEmailPreference,
        workspaceModuleEnabled: row.workspaceModuleEnabled,
        workspaceConnectedAt: row.workspaceConnectedAt,
        workspaceDomain: row.workspaceDomain,
      },
    });

    if (!toEmail) return;

    const memberName = [row.memberFirstName, row.memberLastName].filter(Boolean).join(" ") || toEmail;
    const resend = getResendClient();
    const from = getResendFromEmail();

    await resend.emails.send({
      from,
      to: [toEmail],
      subject: `Payment confirmed — ${row.periodLabel}`,
      react: PaymentConfirmedEmail({
        organizationName: row.orgName,
        memberName,
        periodLabel: row.periodLabel,
        amount: feeAmountToDecimal(row.amount),
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
    // Every id is checked against the caller's scope, not just the first one.
    const { orgId, permittedIds } = await authorizePaymentIds(
      ctx.auth.user.id,
      parsedInput.paymentIds,
    );

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
          inArray(memberPayments.id, permittedIds),
          eq(memberPayments.orgId, orgId),
          inArray(memberPayments.status, ["pending", "overdue"]),
        ),
      )
      .returning({ id: memberPayments.id, memberId: memberPayments.memberId });

    after(async () => {
      for (const { id } of result) {
        await sendPaymentConfirmedEmail(id, paidAt);
      }
    });

    return {
      updated: result.length,
      // Ids outside the caller's scope, already paid, or cancelled.
      skipped: parsedInput.paymentIds.length - result.length,
    };
  });
