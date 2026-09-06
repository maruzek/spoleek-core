"use client";

import { useMemo, useState } from "react";
import { useFormatters } from "@/components/locale-provider";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createColumnHelper } from "@tanstack/react-table";
import { CheckIcon, RefreshCwIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { PaymentActions } from "@/components/app/payments/payment-actions";
import { PaymentDetailDialog } from "@/components/app/payments/payment-detail-dialog";
import { PaymentStatusBadge } from "@/components/app/payments/payment-status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { comparePaymentStatus, formatFeeAmount, getPaymentTitle } from "@/lib/payments";
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

/** Sentinel for "no group filter" — Radix Select cannot hold an empty value. */
const ALL_GROUPS = "__all__";

export function PaymentsAdmin({ payments, isFullAdmin }: { payments: PaymentRow[]; isFullAdmin: boolean }) {
  const { formatDateTime } = useFormatters();

  const router = useRouter();
  const [detailPayment, setDetailPayment] = useState<PaymentRow | null>(null);
  const [groupId, setGroupId] = useState<string>(ALL_GROUPS);

  // Options come from the rows on screen rather than from every group in the
  // org, so the dropdown can never offer a group that would filter to nothing.
  const groupOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const payment of payments) {
      for (const group of payment.memberGroups) byId.set(group.id, group.name);
    }
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [payments]);

  const visiblePayments = useMemo(
    () =>
      groupId === ALL_GROUPS
        ? payments
        : payments.filter((payment) => payment.memberGroups.some((g) => g.id === groupId)),
    [payments, groupId],
  );

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
      header: ({ column }) => <SortableHeader column={column}>Member</SortableHeader>,
      meta: { label: "Member" },
    }),
    columnHelper.accessor("periodLabel", {
      header: ({ column }) => <SortableHeader column={column}>Payment</SortableHeader>,
      meta: { label: "Payment" },
      cell: ({ row }) => getPaymentTitle(row.original.type, row.original.periodLabel),
    }),
    columnHelper.accessor("amount", {
      header: ({ column }) => <SortableHeader column={column}>Amount</SortableHeader>,
      meta: { label: "Amount" },
      cell: ({ row }) =>
        formatFeeAmount(row.original.amount, row.original.currency),
    }),
    columnHelper.accessor("status", {
      header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
      meta: { label: "Status" },
      cell: ({ row }) => <PaymentStatusBadge status={row.original.status} />,
      // Without this the column would sort alphabetically (cancelled, overdue,
      // paid, pending) and contradict the server ordering.
      sortingFn: (a, b) => comparePaymentStatus(a.original.status, b.original.status),
    }),
    columnHelper.display({
      id: "memberGroups",
      header: "Groups",
      meta: { label: "Groups" },
      cell: ({ row }) =>
        row.original.memberGroups.map((g) => g.name).join(", ") || "—",
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
      header: ({ column }) => <SortableHeader column={column}>Due</SortableHeader>,
      meta: { label: "Due" },
      cell: ({ row }) => formatDateTime(row.original.dueAt),
    }),
    columnHelper.accessor("paidAt", {
      header: ({ column }) => <SortableHeader column={column}>Paid at</SortableHeader>,
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
      <PaymentSummary payments={visiblePayments} />
      <DataTable
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        data={visiblePayments}
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
              {groupOptions.length > 0 && (
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger className="w-[200px]" aria-label="Filter by group">
                    <UsersIcon data-icon="inline-start" />
                    <SelectValue placeholder="All groups" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_GROUPS}>All groups</SelectItem>
                    {groupOptions.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
