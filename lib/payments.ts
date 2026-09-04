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
  const amount = feeAmountToDecimal(payment.amount);
  // MSG: include member name if available, max ~60 chars for broad bank compatibility
  const msg = memberName
    ? `${memberName} ${payment.periodLabel}`.slice(0, 60)
    : payment.periodLabel;
  const base = `SPD*1.0*ACC:${iban}*AM:${amount}*CC:${payment.currency}*MSG:${msg}`;
  return payment.variableSymbol ? `${base}*X-VS:${payment.variableSymbol}` : base;
}

/**
 * Fee amounts live in the database as minor units (haléře, cents) so that
 * integer arithmetic stays exact. Forms and emails always deal in major units,
 * so every read/write boundary goes through these two helpers — the group form
 * previously skipped them, which is why an org default of 100 CZK surfaced as
 * "10000" on the group override.
 */
export function feeToMajorUnits(minor: number | null | undefined): number | null {
  return minor == null ? null : minor / 100;
}

export function feeToMinorUnits(major: number | null | undefined): number | null {
  return major == null ? null : Math.round(major * 100);
}

/** Bare decimal string from a stored minor-unit value, e.g. "100.00". */
export function feeAmountToDecimal(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Human-readable amount from a stored minor-unit value, e.g. "100.00 CZK". */
export function formatFeeAmount(minor: number, currency: string): string {
  return `${feeAmountToDecimal(minor)} ${currency}`;
}
