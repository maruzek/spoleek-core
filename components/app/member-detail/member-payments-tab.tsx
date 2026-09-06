"use client";

import { useMemo, useState } from "react";
import { useFormatters } from "@/components/locale-provider";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { WalletIcon } from "lucide-react";

import { PaymentActions } from "@/components/app/payments/payment-actions";
import { PaymentDetailDialog } from "@/components/app/payments/payment-detail-dialog";
import { PaymentStatusBadge } from "@/components/app/payments/payment-status-badge";
import type { PaymentWithMember } from "@/components/app/payments/types";
import { DataTable } from "@/components/ui/data-table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatBankAccount } from "@/lib/iban";
import { formatFeeAmount, getPaymentTitle } from "@/lib/payments";
import { cn } from "@/lib/utils";
import type { MemberPayment } from "@/server/db/schema";
import type { MemberPaymentSummary } from "@/server/queries/member-detail";

const columnHelper = createColumnHelper<PaymentWithMember>();

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - new Date(from).getTime()) / DAY_MS);
}

function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "destructive";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span
        className={cn(
          "truncate text-lg font-semibold tabular-nums",
          tone === "destructive" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {hint ? (
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

export function MemberPaymentsTab({
  payments,
  summary,
  memberName,
}: {
  payments: MemberPayment[];
  summary: MemberPaymentSummary;
  memberName: string;
}) {
  const { formatDate, formatDateTime } = useFormatters();

  const router = useRouter();
  const [detailPayment, setDetailPayment] = useState<PaymentWithMember | null>(
    null,
  );

  const now = useMemo(() => new Date(), []);

  /**
   * The shared payment components all speak `PaymentWithMember`; the member
   * page already knows the name, so attach it once here.
   *
   * Unsettled fees lead the table — overdue first, then pending, each by due
   * date — so what needs acting on is the first thing read. Sorting a column
   * overrides this, which is the right escape hatch.
   */
  const rows: PaymentWithMember[] = useMemo(() => {
    const urgency: Record<PaymentWithMember["status"], number> = {
      overdue: 0,
      pending: 1,
      paid: 2,
      cancelled: 3,
    };

    return payments
      .map((payment) => ({ ...payment, memberName }))
      .sort((left, right) => {
        const byUrgency = urgency[left.status] - urgency[right.status];
        if (byUrgency !== 0) {
          return byUrgency;
        }

        return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
      });
  }, [memberName, payments]);

  const stats = useMemo(() => {
    const thisYear = now.getFullYear();
    let paidThisYearCents = 0;
    let paidCount = 0;
    let onTimeCount = 0;
    let oldestOverdueDays = 0;

    for (const payment of rows) {
      if (payment.status === "paid" && payment.paidAt) {
        paidCount += 1;

        if (new Date(payment.paidAt) <= new Date(payment.dueAt)) {
          onTimeCount += 1;
        }

        if (new Date(payment.paidAt).getFullYear() === thisYear) {
          paidThisYearCents += payment.amount;
        }
      }

      if (payment.status === "overdue") {
        oldestOverdueDays = Math.max(
          oldestOverdueDays,
          daysBetween(payment.dueAt, now),
        );
      }
    }

    return {
      paidThisYearCents,
      oldestOverdueDays,
      // Undefined rather than 100% when nothing has ever been paid — a member
      // with no history has no record, not a perfect one.
      onTimeRate: paidCount > 0 ? Math.round((onTimeCount / paidCount) * 100) : null,
    };
  }, [now, rows]);

  const columns = useMemo(
    () => [
      columnHelper.accessor(
        (payment) =>
          [
            getPaymentTitle(payment.type, payment.periodLabel),
            payment.variableSymbol ?? "",
            payment.status,
          ].join(" "),
        {
          id: "payment",
          header: "Payment",
          meta: { label: "Payment" },
          cell: ({ row }) => {
            const isUnsettled =
              row.original.status === "overdue" ||
              row.original.status === "pending";

            return (
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    isUnsettled ? "bg-destructive" : "bg-transparent",
                  )}
                />
                <span className="font-medium">
                  {getPaymentTitle(row.original.type, row.original.periodLabel)}
                </span>
              </span>
            );
          },
        },
      ),
      columnHelper.accessor("status", {
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => (
          <PaymentStatusBadge status={row.original.status} emphasizeUnpaid />
        ),
      }),
      columnHelper.accessor("amount", {
        header: "Amount",
        meta: { label: "Amount" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatFeeAmount(row.original.amount, row.original.currency)}
          </span>
        ),
      }),
      columnHelper.accessor("dueAt", {
        header: "Due",
        meta: { label: "Due" },
        cell: ({ row }) => {
          const overdueDays =
            row.original.status === "overdue"
              ? daysBetween(row.original.dueAt, now)
              : 0;

          return (
            <div className="flex flex-col">
              <span className="text-muted-foreground">
                {formatDate(row.original.dueAt)}
              </span>
              {overdueDays > 0 ? (
                <span className="text-xs font-medium text-destructive">
                  {overdueDays} day{overdueDays === 1 ? "" : "s"} overdue
                </span>
              ) : null}
            </div>
          );
        },
      }),
      columnHelper.accessor("paidAt", {
        header: "Paid",
        meta: { label: "Paid" },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.paidAt ? formatDateTime(row.original.paidAt) : "—"}
          </span>
        ),
      }),
      columnHelper.accessor("variableSymbol", {
        header: "VS",
        meta: { label: "Variable symbol" },
        cell: ({ row }) =>
          row.original.variableSymbol ? (
            <span className="font-mono text-xs">
              {row.original.variableSymbol}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      columnHelper.accessor("bankAccount", {
        header: "Account",
        meta: { label: "Account" },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.bankAccount
              ? formatBankAccount(row.original.bankAccount).primary
              : "—"}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        meta: { label: "Actions" },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <PaymentActions
              payment={row.original}
              onSuccess={() => router.refresh()}
            />
          </div>
        ),
      }),
    ],
    [formatDate, formatDateTime, now, router],
  );

  if (payments.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WalletIcon />
          </EmptyMedia>
          <EmptyTitle>No payments yet</EmptyTitle>
          <EmptyDescription>
            Membership fees appear here once a period is generated for this
            member.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const currency = summary.currency ?? "CZK";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 rounded-xl border bg-muted/20 px-5 py-4 sm:grid-cols-4">
        <StatTile
          label="Unpaid"
          value={formatFeeAmount(summary.outstandingCents, currency)}
          hint={
            summary.nextDueAt
              ? `Next due ${formatDate(summary.nextDueAt)}`
              : undefined
          }
          tone={summary.outstandingCents > 0 ? "destructive" : "default"}
        />
        <StatTile
          label="Overdue"
          value={String(summary.overdueCount)}
          hint={
            stats.oldestOverdueDays > 0
              ? `Oldest ${stats.oldestOverdueDays} days`
              : undefined
          }
          tone={summary.overdueCount > 0 ? "destructive" : "default"}
        />
        <StatTile
          label={`Paid in ${now.getFullYear()}`}
          value={formatFeeAmount(stats.paidThisYearCents, currency)}
          hint={`${formatFeeAmount(summary.paidCents, currency)} all time`}
        />
        <StatTile
          label="Paid on time"
          value={stats.onTimeRate === null ? "—" : `${stats.onTimeRate}%`}
          hint={stats.onTimeRate === null ? "No payments settled yet" : undefined}
        />
      </div>

      <DataTable
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        data={rows}
        searchKey="payment"
        searchPlaceholder="Search payments..."
        emptyStateTitle="No matching payments"
        emptyStateDescription="Try a different search term."
        onRowClick={(payment) => setDetailPayment(payment)}
      />

      <PaymentDetailDialog
        payment={detailPayment}
        open={detailPayment !== null}
        onOpenChange={(open) => {
          if (!open) setDetailPayment(null);
        }}
        onSuccess={() => {
          setDetailPayment(null);
          router.refresh();
        }}
      />
    </div>
  );
}
