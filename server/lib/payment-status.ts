import { and, eq, inArray } from "drizzle-orm";

import { PaymentConfirmedEmail } from "@/emails/payment-confirmed-email";
import { formatLongDate } from "@/lib/format";
import { feeAmountToDecimal } from "@/lib/payments";
import { db } from "@/server/db";
import {
  eventResponses,
  memberPayments,
  organizations,
  tenantMembers,
  type MemberPreferredEmail,
} from "@/server/db/schema";
import { getResendClient, getResendFromEmail } from "@/server/lib/email";
import { syncReportMemberForPayment } from "@/server/lib/membership-report";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";


/**
 * Status transitions shared by the payments dashboard and the event response
 * list. Both doors must behave identically — the same guard on the current
 * status, the same report sync, the same email — so the bodies live here and
 * the actions only decide *which* rows the caller may touch.
 */

export const CANCELLATION_REASONS = [
  "duplicate",
  "waived",
  "admin_error",
  "other",
] as const;

/** The dashboard reasons plus the two only event payments use. */
export const EVENT_CANCELLATION_REASONS = [
  ...CANCELLATION_REASONS,
  "rsvp_withdrawn",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];
export type EventCancellationReason = (typeof EVENT_CANCELLATION_REASONS)[number];

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * `pending | overdue → paid`. Returns the ids actually flipped; rows in any
 * other status are left alone and simply missing from the result.
 */
export async function markPaymentsPaid(
  executor: DbExecutor,
  params: {
    orgId: string;
    paymentIds: string[];
    userId: string;
    paidAt: Date;
    adminNote?: string | null;
  },
): Promise<string[]> {
  if (params.paymentIds.length === 0) return [];

  const rows = await executor
    .update(memberPayments)
    .set({
      status: "paid",
      paidAt: params.paidAt,
      confirmedByUserId: params.userId,
      adminNote: params.adminNote ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(memberPayments.id, params.paymentIds),
        eq(memberPayments.orgId, params.orgId),
        inArray(memberPayments.status, ["pending", "overdue"]),
      ),
    )
    .returning({ id: memberPayments.id });

  // Awaited, not deferred: the report entry is a consequence of this
  // decision, and a gap between the two would let the group submit a roster
  // that disagrees with the payments it was built from. (A no-op for event
  // payments — the sync ignores them.)
  for (const { id } of rows) {
    await syncReportMemberForPayment(id);
  }

  return rows.map((row) => row.id);
}

/** `pending | overdue → cancelled` with a reason. Returns the ids flipped. */
export async function cancelPayments(
  executor: DbExecutor,
  params: {
    orgId: string;
    paymentIds: string[];
    reason: EventCancellationReason;
    adminNote?: string | null;
  },
): Promise<string[]> {
  if (params.paymentIds.length === 0) return [];

  const rows = await executor
    .update(memberPayments)
    .set({
      status: "cancelled",
      cancellationReason: params.reason,
      adminNote: params.adminNote ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(memberPayments.id, params.paymentIds),
        eq(memberPayments.orgId, params.orgId),
        inArray(memberPayments.status, ["pending", "overdue"]),
      ),
    )
    .returning({ id: memberPayments.id });

  // A fee waived by an admin still confirms membership; every other
  // cancellation reason means the payment should not have existed, and the
  // sync removes any report row it had created.
  for (const { id } of rows) {
    await syncReportMemberForPayment(id);
  }

  return rows.map((row) => row.id);
}

/**
 * `refund_due → cancelled` with reason `refunded`: the organiser has paid the
 * money back and the record is closed. Returns whether a row was flipped.
 */
export async function markPaymentRefunded(
  executor: DbExecutor,
  params: { orgId: string; paymentId: string; userId: string },
): Promise<boolean> {
  const rows = await executor
    .update(memberPayments)
    .set({
      status: "cancelled",
      cancellationReason: "refunded",
      confirmedByUserId: params.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(memberPayments.id, params.paymentId),
        eq(memberPayments.orgId, params.orgId),
        eq(memberPayments.status, "refund_due"),
      ),
    )
    .returning({ id: memberPayments.id });

  return rows.length > 0;
}

/**
 * Who a payment's emails go to. Members resolve through their preferred
 * email; guests are reached through the RSVP they made. Null once the
 * retention shred has anonymised a guest — there is nobody left to write to.
 */
export function resolvePaymentRecipient(row: {
  memberId: string | null;
  memberEmail: string | null;
  memberWorkspaceEmail: string | null;
  memberPreferredEmail: MemberPreferredEmail | null;
  memberFirstName: string | null;
  memberLastName: string | null;
  guestEmail: string | null;
  guestName: string | null;
  defaultEmailPreference: MemberPreferredEmail;
  workspaceModuleEnabled: boolean;
  workspaceConnectedAt: Date | null;
  workspaceDomain: string | null;
}): { email: string; name: string } | null {
  const email = row.memberId
    ? resolveMemberEmailForOrg({
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
      })
    : row.guestEmail;

  if (!email) return null;

  const name =
    [row.memberFirstName, row.memberLastName].filter(Boolean).join(" ") ||
    row.guestName ||
    email;

  return { email, name };
}

export async function sendPaymentConfirmedEmail(paymentId: string, paidAt: Date) {
  try {
    const [row] = await db
      .select({
        memberId: memberPayments.memberId,
        memberEmail: tenantMembers.email,
        memberWorkspaceEmail: tenantMembers.workspaceUserEmail,
        memberPreferredEmail: tenantMembers.preferredEmail,
        memberFirstName: tenantMembers.firstName,
        memberLastName: tenantMembers.lastName,
        guestEmail: eventResponses.guestEmail,
        guestName: eventResponses.guestName,
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
      .leftJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
      .leftJoin(eventResponses, eq(memberPayments.responseId, eventResponses.id))
      .innerJoin(organizations, eq(memberPayments.orgId, organizations.id))
      .where(eq(memberPayments.id, paymentId))
      .limit(1);

    if (!row || !row.emailNotifyPaymentConfirmed) return;

    const recipient = resolvePaymentRecipient(row);
    if (!recipient) return;

    const resend = getResendClient();
    const from = getResendFromEmail();

    await resend.emails.send({
      from,
      to: [recipient.email],
      subject: `Payment confirmed — ${row.periodLabel}`,
      react: PaymentConfirmedEmail({
        organizationName: row.orgName,
        memberName: recipient.name,
        periodLabel: row.periodLabel,
        amount: feeAmountToDecimal(row.amount),
        currency: row.currency,
        paidAt: formatLongDate(paidAt),
      }),
    });
  } catch {
    // Email failure must not surface as an action error
  }
}
