"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createColumnHelper } from "@tanstack/react-table";
import { CheckIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/format";
import { getPaymentTitle } from "@/lib/payments";
import {
  cancelPaymentAction,
  generatePaymentsAction,
  markPaymentPaidAction,
} from "@/server/actions/payments";
import type { MemberPaymentStatus } from "@/server/db/schema";
import type { PaymentRow } from "@/server/queries/payments";

const columnHelper = createColumnHelper<PaymentRow>();

function PaymentStatusBadge({ status }: { status: MemberPaymentStatus }) {
  const variantMap: Record<MemberPaymentStatus, "destructive" | "secondary" | "default" | "outline"> = {
    overdue: "destructive",
    pending: "secondary",
    paid: "default",
    cancelled: "outline",
  };
  return <Badge variant={variantMap[status]}>{status}</Badge>;
}

function PaymentRowActions({ payment, onSuccess }: { payment: PaymentRow; onSuccess: () => void }) {
  const markPaid = useAction(markPaymentPaidAction, {
    onSuccess() {
      toast.success("Payment marked as paid.");
      onSuccess();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not update payment.");
    },
  });

  const cancel = useAction(cancelPaymentAction, {
    onSuccess() {
      toast.success("Payment cancelled.");
      onSuccess();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not cancel payment.");
    },
  });

  if (payment.status === "paid" || payment.status === "cancelled") {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => markPaid.execute({ paymentId: payment.id })}
        disabled={markPaid.isPending || cancel.isPending}
      >
        <CheckIcon data-icon="inline-start" />
        Mark paid
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => cancel.execute({ paymentId: payment.id })}
        disabled={markPaid.isPending || cancel.isPending}
      >
        <XIcon data-icon="inline-start" />
        Cancel
      </Button>
    </div>
  );
}

export function PaymentsAdmin({ payments, isFullAdmin }: { payments: PaymentRow[]; isFullAdmin: boolean }) {
  const router = useRouter();

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

  const columns = [
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
        `${(row.original.amount / 100).toFixed(2)} ${row.original.currency}`,
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
        <PaymentRowActions
          payment={row.original}
          onSuccess={() => router.refresh()}
        />
      ),
    }),
  ];

  return (
    <DataTable
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      columns={columns as any}
      data={payments}
      searchKey="memberName"
      searchPlaceholder="Filter by member..."
      emptyStateTitle="No payment records"
      emptyStateDescription="Generate payment records for the current renewal period or wait for the nightly cron."
      toolbarActions={() =>
        isFullAdmin ? (
          <Button
            variant="outline"
            onClick={() => generate.execute({})}
            disabled={generate.isPending}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {generate.isPending ? "Generating…" : "Generate payments"}
          </Button>
        ) : null
      }
    />
  );
}
