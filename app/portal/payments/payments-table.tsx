"use client";

import { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/format";
import { getPaymentTitle } from "@/lib/payments";
import type { MemberPayment } from "@/server/db/schema";

const columns: ColumnDef<MemberPayment>[] = [
  {
    accessorKey: "periodLabel",
    header: "Period",
    cell: ({ row }) => (
      <span className="font-medium">
        {getPaymentTitle(row.original.type, row.original.periodLabel)}
      </span>
    ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount")) / 100;
      const currency = row.original.currency;
      return (
        <span className="tabular-nums">
          {amount.toFixed(2)} {currency}
        </span>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge
          variant={
            status === "paid"
              ? "default"
              : status === "cancelled"
              ? "outline"
              : status === "overdue"
              ? "destructive"
              : "secondary"
          }
          className="capitalize"
        >
          {status}
        </Badge>
      );
    },
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

interface PaymentsTableProps {
  data: MemberPayment[];
}

export function PaymentsTable({ data }: PaymentsTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="periodLabel"
      searchPlaceholder="Search periods..."
    />
  );
}
