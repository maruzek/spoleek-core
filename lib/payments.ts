import type { MemberPayment, MemberPaymentType } from "@/server/db/schema";

export function getPaymentTitle(type: MemberPaymentType, periodLabel: string): string {
  switch (type) {
    case "membership_fee":
      return `Membership payment for ${periodLabel}`;
    case "event":
      return `Fee for ${periodLabel}`;
  }
}

export function buildSpdString(
  payment: Pick<MemberPayment, "bankAccount" | "amount" | "currency" | "periodLabel" | "variableSymbol">,
  memberName?: string,
): string | null {
  if (!payment.bankAccount) return null;
  const iban = payment.bankAccount.replace(/\s/g, "").toUpperCase();
  const amount = (payment.amount / 100).toFixed(2);
  // MSG: include member name if available, max ~60 chars for broad bank compatibility
  const msg = memberName
    ? `${memberName} ${payment.periodLabel}`.slice(0, 60)
    : payment.periodLabel;
  const base = `SPD*1.0*ACC:${iban}*AM:${amount}*CC:${payment.currency}*MSG:${msg}`;
  return payment.variableSymbol ? `${base}*X-VS:${payment.variableSymbol}` : base;
}
