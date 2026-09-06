"use client";

import QRCode from "react-qr-code";
import { useFormatters } from "@/components/locale-provider";

import { DefinitionList, DefinitionRow } from "@/components/app/definition-list";
import { PaymentActions } from "@/components/app/payments/payment-actions";
import { PaymentStatusBadge } from "@/components/app/payments/payment-status-badge";
import type { PaymentWithMember } from "@/components/app/payments/types";
import { CopyButton } from "@/components/ui/code-block/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatBankAccount } from "@/lib/iban";
import { buildSpdString, formatFeeAmount, getPaymentTitle } from "@/lib/payments";
import { cn } from "@/lib/utils";

const CANCELLATION_REASON_LABELS: Record<string, string> = {
  duplicate: "Duplicate payment",
  waived: "Fee waived",
  admin_error: "Admin error",
  other: "Other",
};

/**
 * The single place a payment is shown in full — amount, bank details, variable
 * symbol, timestamps, admin notes, and a scannable QR while it is still owed.
 * Opened from the payments dashboard and from a member's payments tab, so an
 * admin sees the same record either way.
 */
export function PaymentDetailDialog({
  payment,
  open,
  onOpenChange,
  onSuccess,
}: {
  payment: PaymentWithMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { formatDateTime } = useFormatters();

  if (!payment) {
    return null;
  }

  const isOverdue = payment.status === "overdue";
  const account = payment.bankAccount
    ? formatBankAccount(payment.bankAccount)
    : null;
  // Only worth scanning while the money is still owed.
  const spdString =
    payment.status === "paid" || payment.status === "cancelled"
      ? null
      : buildSpdString(payment, payment.memberName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
            {getPaymentTitle(payment.type, payment.periodLabel)}
            <PaymentStatusBadge status={payment.status} />
          </DialogTitle>
          <DialogDescription>{payment.memberName}</DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "rounded-xl px-4 py-3",
            isOverdue ? "bg-destructive/5" : "bg-muted/40",
          )}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Amount
          </p>
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums tracking-tight",
              isOverdue ? "text-destructive" : "text-foreground",
            )}
          >
            {formatFeeAmount(payment.amount, payment.currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            {isOverdue ? "Overdue since " : "Due "}
            <span className={cn(isOverdue && "font-medium text-destructive")}>
              {formatDateTime(payment.dueAt)}
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <DefinitionList className="min-w-0 flex-1">
            {account ? (
              <DefinitionRow
                label="Bank account"
                value={<span className="font-mono">{account.primary}</span>}
                description={
                  account.secondary ? (
                    <span className="font-mono text-xs">
                      {account.secondary}
                    </span>
                  ) : undefined
                }
                action={
                  <CopyButton
                    content={account.primary}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Copy bank account"
                  />
                }
              />
            ) : null}
            {payment.variableSymbol ? (
              <DefinitionRow
                label="Variable symbol"
                value={
                  <span className="font-mono tracking-wider">
                    {payment.variableSymbol}
                  </span>
                }
                action={
                  <CopyButton
                    content={payment.variableSymbol}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Copy variable symbol"
                  />
                }
              />
            ) : null}
            <DefinitionRow label="Period" value={payment.periodLabel} />
            <DefinitionRow
              label="Paid at"
              value={payment.paidAt ? formatDateTime(payment.paidAt) : "Not paid"}
            />
            {payment.cancellationReason ? (
              <DefinitionRow
                label="Cancelled"
                value={
                  CANCELLATION_REASON_LABELS[payment.cancellationReason] ??
                  payment.cancellationReason
                }
              />
            ) : null}
            {payment.adminNote ? (
              <DefinitionRow label="Admin note" value={payment.adminNote} />
            ) : null}
            {payment.notes ? (
              <DefinitionRow label="Notes" value={payment.notes} />
            ) : null}
            <DefinitionRow
              label="Created"
              value={formatDateTime(payment.createdAt)}
            />
          </DefinitionList>

          {spdString ? (
            <div className="flex shrink-0 flex-col items-center gap-2 sm:pt-2">
              <div className="rounded-xl border bg-white p-3">
                <QRCode value={spdString} size={128} />
              </div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Scan to pay
              </p>
            </div>
          ) : null}
        </div>

        {!account ? (
          <>
            <Separator />
            <p className="text-sm italic text-muted-foreground">
              No bank account is configured for this payment, so it cannot be
              paid by transfer or QR code.
            </p>
          </>
        ) : null}

        <DialogFooter>
          <PaymentActions payment={payment} onSuccess={onSuccess} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
