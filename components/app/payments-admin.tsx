"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createColumnHelper } from "@tanstack/react-table";
import { CheckIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { PaymentActions } from "@/components/app/payments/payment-actions";
import { PaymentDetailDialog } from "@/components/app/payments/payment-detail-dialog";
import { PaymentStatusBadge } from "@/components/app/payments/payment-status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/format";
import { formatFeeAmount, getPaymentTitle } from "@/lib/payments";
import {
  bulkMarkPaymentsPaidAction,
  generatePaymentsAction,
} from "@/server/actions/payments";
import type { MemberPaymentStatus } from "@/server/db/schema";
import type { PaymentRow } from "@/server/queries/payments";

const columnHelper = createColumnHelper<PaymentRow>();

function PaymentSummary({ payments }: { payments: PaymentRow[] }) {
  const counts = payments.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<MemberPaymentStatus, number>,
  );

  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{payments.length}</span> total
      </div>
      {counts.paid ? (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{counts.paid}</span> paid
        </div>
      ) : null}
      {counts.pending ? (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{counts.pending}</span> pending
        </div>
      ) : null}
      {counts.overdue ? (
        <div className="flex items-center gap-1.5 text-sm text-destructive">
          <span className="font-medium">{counts.overdue}</span> overdue
        </div>
      ) : null}
      {counts.cancelled ? (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{counts.cancelled}</span> cancelled
        </div>
      ) : null}
    </div>
  );
}

export function PaymentsAdmin({ payments, isFullAdmin }: { payments: PaymentRow[]; isFullAdmin: boolean }) {
  const router = useRouter();
  const [detailPayment, setDetailPayment] = useState<PaymentRow | null>(null);

  const generate = useAction(generatePaymentsAction, {
    onSuccess({ data }) {
      toast.success(
        `Generated ${data?.paymentsCreated ?? 0} payment record${(data?.paymentsCreated ?? 0) !== 1 ? "s" : ""}.`,
      );
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not generate payments.");
    },
  });

  const bulkPaid = useAction(bulkMarkPaymentsPaidAction, {
    onSuccess({ data }) {
      toast.success(`Marked ${data?.updated ?? 0} payment${(data?.updated ?? 0) !== 1 ? "s" : ""} as paid.`);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not update payments.");
    },
  });

  const columns = [
    columnHelper.display({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) =>
        row.original.status === "paid" || row.original.status === "cancelled" ? null : (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
      enableSorting: false,
      enableHiding: false,
    }),
    columnHelper.accessor("memberName", {
      header: "Member",
      meta: { label: "Member" },
    }),
    columnHelper.accessor("periodLabel", {
      header: "Payment",
      meta: { label: "Payment" },
      cell: ({ row }) => getPaymentTitle(row.original.type, row.original.periodLabel),
    }),
    columnHelper.accessor("amount", {
      header: "Amount",
      meta: { label: "Amount" },
      cell: ({ row }) =>
        formatFeeAmount(row.original.amount, row.original.currency),
    }),
    columnHelper.accessor("status", {
      header: "Status",
      meta: { label: "Status" },
      cell: ({ row }) => <PaymentStatusBadge status={row.original.status} />,
    }),
    columnHelper.accessor("variableSymbol", {
      header: "VS",
      meta: { label: "Variable symbol" },
      cell: ({ row }) =>
        row.original.variableSymbol ? (
          <span className="font-mono text-xs">{row.original.variableSymbol}</span>
        ) : (
          "—"
        ),
    }),
    columnHelper.accessor("dueAt", {
      header: "Due",
      meta: { label: "Due" },
      cell: ({ row }) => formatDateTime(row.original.dueAt),
    }),
    columnHelper.accessor("paidAt", {
      header: "Paid at",
      meta: { label: "Paid at" },
      cell: ({ row }) =>
        row.original.paidAt ? formatDateTime(row.original.paidAt) : "—",
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <PaymentActions
          payment={row.original}
          onSuccess={() => router.refresh()}
        />
      ),
    }),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PaymentSummary payments={payments} />
      <DataTable
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        data={payments}
        searchKey="memberName"
        searchPlaceholder="Filter by member..."
        emptyStateTitle="No payment records"
        emptyStateDescription="Generate payment records for the current renewal period or wait for the nightly cron."
        onRowClick={(payment) => setDetailPayment(payment)}
        toolbarActions={(table) => {
          const selected = table
            .getFilteredSelectedRowModel()
            .rows.map((r) => (r.original as PaymentRow).id);

          return (
            <>
              {selected.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => bulkPaid.execute({ paymentIds: selected })}
                  disabled={bulkPaid.isPending}
                >
                  <CheckIcon data-icon="inline-start" />
                  {bulkPaid.isPending
                    ? "Marking…"
                    : `Mark ${selected.length} as paid`}
                </Button>
              )}
              {isFullAdmin && (
                <Button
                  variant="outline"
                  onClick={() => generate.execute({})}
                  disabled={generate.isPending}
                >
                  <RefreshCwIcon data-icon="inline-start" />
                  {generate.isPending ? "Generating…" : "Generate payments"}
                </Button>
              )}
            </>
          );
        }}
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
