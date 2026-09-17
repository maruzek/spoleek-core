import type {
  MemberPayment,
  MemberPaymentStatus,
  MemberPaymentType,
} from "@/server/db/schema";

export function getPaymentTitle(
  type: MemberPaymentType,
  periodLabel: string,
): string {
  switch (type) {
    case "membership_fee":
      return `Membership payment for ${periodLabel}`;
    case "event":
      return `Fee for ${periodLabel}`;
  }
}

/**
 * The name written into a payment QR's message: the member's, else the guest
 * name from the RSVP, else nothing (a shredded guest — the VS still matches).
 */
export function paymentQrPayerName(row: {
  firstName: string | null;
  lastName: string | null;
  guestName: string | null;
}): string | undefined {
  return (
    [row.firstName, row.lastName].filter(Boolean).join(" ") ||
    row.guestName ||
    undefined
  );
}

export function buildSpdString(
  payment: Pick<
    MemberPayment,
    "bankAccount" | "amount" | "currency" | "periodLabel" | "variableSymbol"
  >,
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
  return payment.variableSymbol
    ? `${base}*X-VS:${payment.variableSymbol}`
    : base;
}

/**
 * Fee amounts live in the database as minor units (haléře, cents) so that
 * integer arithmetic stays exact. Forms and emails always deal in major units,
 * so every read/write boundary goes through these two helpers — the group form
 * previously skipped them, which is why an org default of 100 CZK surfaced as
 * "10000" on the group override.
 */
export function feeToMajorUnits(
  minor: number | null | undefined,
): number | null {
  return minor == null ? null : minor / 100;
}

export function feeToMinorUnits(
  major: number | null | undefined,
): number | null {
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

/**
 * Locale-aware money for member-facing pages: "350 Kč" in Czech, "CZK 350"
 * in English, decimals only when the amount has them. Falls back to
 * `formatFeeAmount` for a currency `Intl` does not know.
 */
export function formatMoney(minor: number, currency: string, locale: string): string {
  const whole = minor % 100 === 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return formatFeeAmount(minor, currency);
  }
}

/**
 * Dashboard ordering for payment statuses: lower rank sorts higher up the
 * table. Outstanding work comes first — an admin opens this page to see who
 * still owes money, not to admire settled rows — and closed records sink.
 *
 * Kept here rather than in the query so the server ordering and any
 * client-side re-sort agree on one definition.
 */
export const PAYMENT_STATUS_SORT_ORDER: Record<MemberPaymentStatus, number> = {
  // Money the organization owes back is the most urgent thing on the page.
  refund_due: 0,
  overdue: 1,
  pending: 2,
  // Settled records — paid and cancelled alike — are closed business, so they
  // share a rank and fall through to the due-date tiebreaker instead of being
  // split into two blocks.
  paid: 3,
  cancelled: 3,
};

/** Comparator for TanStack Table / Array#sort over payment statuses. */
export function comparePaymentStatus(
  a: MemberPaymentStatus,
  b: MemberPaymentStatus,
): number {
  return PAYMENT_STATUS_SORT_ORDER[a] - PAYMENT_STATUS_SORT_ORDER[b];
}

/**
 * One palette for payment statuses, shared by the badges, the stat cards and
 * the pie chart. These lived in three places before — the chart drew pending in
 * blue while the table badge used the grey `secondary` variant, so a pending
 * row simply vanished among the muted text.
 *
 * `chart` is a raw hex because Recharts fills SVG, not classes. The table
 * badge is `PaymentStatusBadge`, on the shared `Status` dot primitive.
 */
export const PAYMENT_STATUS_COLORS: Record<MemberPaymentStatus, { chart: string }> = {
  overdue: { chart: "#ef4444" },
  refund_due: { chart: "#f97316" },
  pending: { chart: "#3b82f6" },
  paid: { chart: "#176b4d" },
  cancelled: { chart: "#94a3b8" },
};
