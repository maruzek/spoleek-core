"use client";
import { formatFeeAmount } from "@/lib/payments";
import { useFormatters } from "@/components/locale-provider";

import { useMemo } from "react";

import { ColumnDef } from "@tanstack/react-table";

import Link from "next/link";

import { PaymentStatusBadge } from "@/components/app/payments/payment-status-badge";
import { DataTable } from "@/components/ui/data-table";
import { comparePaymentStatus, getPaymentTitle } from "@/lib/payments";
import type { MemberPaymentRow } from "@/server/queries/payments";

function buildColumns(
  formatDateTime: (date: Date | string | null | undefined) => string,
): ColumnDef<MemberPaymentRow>[] {
  return [
  {
    accessorKey: "periodLabel",
    header: "Payment",
    cell: ({ row }) =>
      row.original.type === "event" && row.original.eventSlug ? (
        <Link href={`/portal/events/${row.original.eventSlug}`} className="font-medium underline-offset-4 hover:underline">
          {getPaymentTitle(row.original.type, row.original.eventTitle ?? row.original.periodLabel)}
        </Link>
      ) : (
        <span className="font-medium">
          {getPaymentTitle(row.original.type, row.original.periodLabel)}
        </span>
      ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => {
      return (
        <span className="tabular-nums">
          {formatFeeAmount(row.original.amount, row.original.currency)}
        </span>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <PaymentStatusBadge status={row.original.status} />,
    sortingFn: (a, b) => comparePaymentStatus(a.original.status, b.original.status),
  },
  {
    accessorKey: "variableSymbol",
    header: "VS",
    cell: ({ row }) => {
      const vs = row.original.variableSymbol;
      return vs ? (
        <span className="font-mono text-xs">{vs}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "dueAt",
    header: "Due Date",
    cell: ({ row }) => {
      const date = row.getValue("dueAt") as Date;
      return <span className="text-muted-foreground">{formatDateTime(date)}</span>;
    },
  },
  {
    accessorKey: "paidAt",
    header: "Paid At",
    cell: ({ row }) => {
      const date = row.getValue("paidAt") as Date | null;
      if (!date) return <span className="text-muted-foreground">—</span>;
      return <span>{formatDateTime(date)}</span>;
    },
  },
  ];
}

interface PaymentsTableProps {
  data: MemberPaymentRow[];
}

export function PaymentsTable({ data }: PaymentsTableProps) {
  const { formatDateTime } = useFormatters();
  const columns = useMemo(() => buildColumns(formatDateTime), [formatDateTime]);

  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="periodLabel"
      searchPlaceholder="Search payments..."
    />
  );
}
