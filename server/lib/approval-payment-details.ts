import { addDays } from "date-fns";
import { and, asc, eq, inArray } from "drizzle-orm";

import { formatFeeAmount, getPaymentTitle } from "@/lib/payments";
import { db } from "@/server/db";
import { groups, memberPayments } from "@/server/db/schema";
import { PAYMENT_QR_GRACE_DAYS, buildPaymentQrUrl } from "@/server/lib/payment-qr";
import { formatLongDate } from "@/lib/format";

export type ApprovalPaymentDetails = {
  title: string;
  amount: string;
  bankAccount: string | null;
  variableSymbol: string | null;
  dueDate: string;
  periodLabel: string;
  /** Set when the amount comes from a group override rather than the org default. */
  sourceGroupName: string | null;
  /** Absolute PNG URL, or null when there is no IBAN to encode. */
  qrUrl: string | null;
};

/**
 * Payment block for the approval email.
 *
 * The group-overrides-org rule is not re-implemented here: approval already
 * called generatePaymentForMember(), which resolves the fee from the member's
 * fee-managing group and falls back to the organization defaults. This reads
 * that row back so the email can never disagree with what the member owes.
 */
export async function getApprovalPaymentDetails(
  orgId: string,
  memberId: string,
): Promise<ApprovalPaymentDetails | null> {
  const [payment] = await db
    .select()
    .from(memberPayments)
    .where(
      and(
        eq(memberPayments.orgId, orgId),
        eq(memberPayments.memberId, memberId),
        eq(memberPayments.type, "membership_fee"),
        inArray(memberPayments.status, ["pending", "overdue"]),
      ),
    )
    .orderBy(asc(memberPayments.dueAt))
    .limit(1);

  if (!payment) return null;

  // periodKey is "<period>:grp:<groupId>" when a group override produced the
  // amount — naming the group tells the member why their fee differs.
  const groupId = payment.periodKey.split(":grp:")[1] ?? null;
  let sourceGroupName: string | null = null;

  if (groupId) {
    const [group] = await db
      .select({ name: groups.name, feeAmount: groups.feeAmount })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.orgId, orgId)))
      .limit(1);
    // Only claim the fee "is set for" the group when the group overrode the
    // amount. A group may carry the key while overriding only the IBAN or the
    // due window, in which case the amount is still the org's.
    sourceGroupName = group?.feeAmount != null ? group.name : null;
  }

  return {
    title: getPaymentTitle(payment.type, payment.periodLabel),
    amount: formatFeeAmount(payment.amount, payment.currency),
    // Raw IBAN — the email template renders the local format alongside it.
    bankAccount: payment.bankAccount,
    variableSymbol: payment.variableSymbol,
    dueDate: formatLongDate(payment.dueAt),
    periodLabel: payment.periodLabel,
    sourceGroupName,
    // Anchored to this payment's own due date rather than to when the mail
    // was sent, so a reminder and the original email agree on when the QR
    // stops working.
    qrUrl: payment.bankAccount
      ? buildPaymentQrUrl(payment.id, addDays(payment.dueAt, PAYMENT_QR_GRACE_DAYS))
      : null,
  };
}
