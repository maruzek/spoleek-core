"use client";

import { useState } from "react";
import { useDictionary, useFormatters } from "@/components/locale-provider";
import QRCode from "react-qr-code";
import { ChevronDownIcon, CircleCheckIcon, TriangleAlertIcon, UndoIcon } from "lucide-react";

import { CopyButton } from "@/components/ui/code-block/copy-button";
import { formatBankAccount } from "@/lib/iban";
import { buildSpdString, formatMoney } from "@/lib/payments";
import { cn } from "@/lib/utils";
import type { MemberPayment, MemberPaymentType } from "@/server/db/schema";

/** What the card renders: a full `MemberPayment`, or the live-payment slice an event page loads. */
export type PaymentCardPayment = Pick<
  MemberPayment,
  | "id"
  | "status"
  | "amount"
  | "currency"
  | "bankAccount"
  | "variableSymbol"
  | "periodLabel"
  | "dueAt"
  | "paidAt"
> & { type?: MemberPaymentType };

/**
 * One payment as the member sees it. The heading is the state — waiting,
 * overdue, paid, refund — so the card reads at a glance; the QR leads while
 * money is owed, and a settled payment folds its bank details away.
 */
export function PaymentQrCard({
  payment,
  payerName,
  eventTitle,
  showEventTitle = true,
}: {
  payment: PaymentCardPayment;
  /**
   * Who owes this payment. Taken as a prop rather than read from the app shell
   * so an admin viewing someone else's record does not end up in the SPD
   * string as the payer.
   */
  payerName?: string;
  /** For event payments: names the event in the eyebrow. */
  eventTitle?: string;
  /** Off when the card sits on the event's own page, where the title is right above it. */
  showEventTitle?: boolean;
}) {
  const { formatDate, locale } = useFormatters();
  const t = useDictionary().payments.card;
  const [detailsOpen, setDetailsOpen] = useState(false);

  const type = payment.type ?? (eventTitle ? "event" : "membership_fee");
  const memberName = payerName?.trim() || undefined;
  const isOverdue = payment.status === "overdue";
  const isPending = payment.status === "pending";
  const isPaid = payment.status === "paid";
  const isRefundDue = payment.status === "refund_due";
  const owed = isPending || isOverdue;
  // Only worth scanning while the money is still owed.
  const spdString = owed ? buildSpdString(payment, memberName) : null;
  const account = payment.bankAccount ? formatBankAccount(payment.bankAccount) : null;
  // A Czech account splits into number/code so each can be copied into its own field.
  const local = account?.primary.match(/^(.+)\/(\d{4})$/);
  const amount = formatMoney(payment.amount, payment.currency, locale);

  const eyebrow =
    type === "membership_fee"
      ? `${t.membershipFee} · ${payment.periodLabel}`
      : showEventTitle && eventTitle
        ? `${t.eventFee} · ${eventTitle}`
        : t.eventFee;

  const heading = isPaid
    ? t.statePaid
    : isOverdue
      ? t.stateOverdue
      : isRefundDue
        ? t.stateRefundDue
        : isPending
          ? t.statePending
          : t.stateCancelled;

  const tone = isOverdue ? "error" : isRefundDue ? "warning" : isPaid ? "success" : "default";

  const details = (
    <dl className="flex flex-col gap-2.5 text-sm">
      {account && local ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
          <DetailRow label={t.bankAccount} copyLabel={t.copy(t.bankAccount)} value={local[1]} />
          <DetailRow label={t.bankCode} copyLabel={t.copy(t.bankCode)} value={local[2]} />
        </div>
      ) : account ? (
        <DetailRow label={t.bankAccount} copyLabel={t.copy(t.bankAccount)} value={account.primary} />
      ) : null}
      {payment.variableSymbol ? (
        <DetailRow
          label={t.variableSymbol}
          copyLabel={t.copy(t.variableSymbol)}
          value={payment.variableSymbol}
          emphasize
        />
      ) : null}
      {memberName ? <DetailRow label={t.payer} value={memberName} /> : null}
    </dl>
  );

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs",
        tone === "error" && "border-destructive/40",
        tone === "warning" && "border-orange-500/40",
      )}
    >
      <div
        className={cn(
          "h-1 w-full",
          tone === "error" && "bg-destructive",
          tone === "warning" && "bg-orange-500",
          tone === "success" && "bg-green-600 dark:bg-green-500",
          tone === "default" && "bg-primary",
        )}
      />

      {/* Header: eyebrow, state as the title, amount on the right. */}
      <div className="flex items-start justify-between gap-4 p-4 pb-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
          <h2
            className={cn(
              "mt-0.5 flex items-center gap-1.5 font-medium text-lg leading-tight",
              tone === "error" && "text-destructive",
              tone === "success" && "text-green-700 dark:text-green-400",
            )}
          >
            {isPaid ? <CircleCheckIcon className="size-4 shrink-0" aria-hidden /> : null}
            {isOverdue ? <TriangleAlertIcon className="size-4 shrink-0" aria-hidden /> : null}
            {isRefundDue ? <UndoIcon className="size-4 shrink-0" aria-hidden /> : null}
            {heading}
          </h2>
          <p className={cn("mt-1 text-xs", isOverdue ? "text-destructive" : "text-muted-foreground")}>
            {isPaid
              ? payment.paidAt
                ? t.paidOn(formatDate(payment.paidAt))
                : null
              : isOverdue
                ? t.overdueSince(formatDate(payment.dueAt))
                : isPending
                  ? t.dueBy(formatDate(payment.dueAt))
                  : null}
          </p>
        </div>
        <p
          className={cn(
            "shrink-0 font-semibold text-2xl tabular-nums tracking-tight",
            isOverdue ? "text-destructive" : "text-foreground",
          )}
        >
          {amount}
        </p>
      </div>

      {isRefundDue ? <p className="px-4 pb-4 text-sm text-muted-foreground">{t.refundBody}</p> : null}

      {owed ? (
        <div className="flex flex-col gap-4 border-t border-dashed p-4">
          {spdString ? (
            <div className="flex justify-center">
              <div className="rounded-lg bg-white p-2">
                <QRCode value={spdString} size={144} />
              </div>
            </div>
          ) : null}
          {account ? details : <p className="text-sm text-muted-foreground">{t.noAccount}</p>}
        </div>
      ) : null}

      {isPaid && (account || payment.variableSymbol) ? (
        <div className="border-t border-dashed">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((o) => !o)}
          >
            {t.showDetails}
            <ChevronDownIcon className={cn("size-3.5 transition-transform", detailsOpen && "rotate-180")} aria-hidden />
          </button>
          {detailsOpen ? <div className="px-4 pb-4">{details}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  copyLabel,
  emphasize,
}: {
  label: string;
  value: string;
  copyLabel?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className={cn("truncate font-mono text-sm tabular-nums", emphasize && "font-semibold tracking-wider")}>
          {value}
        </dd>
      </div>
      {copyLabel ? <CopyButton content={value} aria-label={copyLabel} title={copyLabel} className="shrink-0" /> : null}
    </div>
  );
}
