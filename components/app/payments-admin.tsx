"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFormatters } from "@/components/locale-provider";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createColumnHelper } from "@tanstack/react-table";
import { CalendarIcon, CheckIcon, IdCardIcon, RefreshCwIcon, UndoIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { PaymentActions } from "@/components/app/payments/payment-actions";
import { PaymentDetailDialog } from "@/components/app/payments/payment-detail-dialog";
import {
  PaymentStatusBadge,
  paymentStatusDotVariant,
  paymentStatusLabel,
} from "@/components/app/payments/payment-status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { comparePaymentStatus, formatFeeAmount, PAYMENT_STATUS_SORT_ORDER } from "@/lib/payments";
import { STATUS_DOT_CLASSES, STATUS_TEXT_CLASSES } from "@/lib/status-dot";
import { cn } from "@/lib/utils";
import {
  bulkMarkPaymentsPaidAction,
  generatePaymentsAction,
} from "@/server/actions/payments";
import type { MemberPaymentStatus, MemberPaymentType } from "@/server/db/schema";
import type { PaymentRow } from "@/server/queries/payments";

const columnHelper = createColumnHelper<PaymentRow>();

type StatusFilter = MemberPaymentStatus | null;

const STATUSES = (Object.keys(paymentStatusLabel) as MemberPaymentStatus[]).sort(
  (a, b) => PAYMENT_STATUS_SORT_ORDER[a] - PAYMENT_STATUS_SORT_ORDER[b] || a.localeCompare(b),
);

/**
 * One chip per status, coloured from the same map as the badges, and each one
 * a filter. Counts come from the rows before the status filter is applied, so
 * the numbers do not collapse to one the moment a chip is picked.
 */
function PaymentSummary({
  payments,
  status,
  onStatusChange,
}: {
  payments: PaymentRow[];
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
}) {
  const counts = payments.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<MemberPaymentStatus, number>>,
  );

  const chip = "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors";

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
      <button
        type="button"
        onClick={() => onStatusChange(null)}
        aria-pressed={status === null}
        className={cn(chip, status === null ? "border-foreground/30 bg-muted" : "border-transparent hover:bg-muted/60")}
      >
        <span className="font-medium tabular-nums">{payments.length}</span>
        <span className="text-muted-foreground">total</span>
      </button>
      {STATUSES.map((s) => {
        const count = counts[s];
        if (!count) return null;
        const variant = paymentStatusDotVariant[s];
        const active = status === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onStatusChange(active ? null : s)}
            aria-pressed={active}
            className={cn(
              chip,
              STATUS_TEXT_CLASSES[variant],
              active ? "border-current/40 bg-current/10" : "border-transparent hover:bg-muted/60",
            )}
          >
            <span className={cn("size-1.5 rounded-full", STATUS_DOT_CLASSES[variant])} aria-hidden />
            <span className="font-medium tabular-nums">{count}</span>
            <span className={variant === "default" ? "text-muted-foreground" : "opacity-80"}>
              {paymentStatusLabel[s].toLowerCase()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Sentinel for "no group filter" — Radix Select cannot hold an empty value. */
const ALL_GROUPS = "__all__";

type TypeFilter = "all" | MemberPaymentType;

/**
 * Paid event payments whose RSVP was withdrawn. The rows themselves sit at the
 * top of the table (refund_due sorts first) with an orange tint; this strip
 * only totals them and jumps the filter there. Nothing settles them
 * automatically.
 */
function RefundsDue({
  refunds,
  active,
  onShow,
}: {
  refunds: PaymentRow[];
  active: boolean;
  onShow: () => void;
}) {
  if (refunds.length === 0) return null;

  const total = refunds.reduce((sum, r) => sum + r.amount, 0);
  const currency = refunds[0]?.currency ?? "";
  const sameCurrency = refunds.every((r) => r.currency === currency);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-orange-500/40 bg-orange-500/5 px-4 py-2.5">
      <UndoIcon className="size-4 text-orange-600 dark:text-orange-400" aria-hidden />
      <p className="text-sm font-medium">
        {refunds.length === 1 ? "1 refund due" : `${refunds.length} refunds due`}
        {sameCurrency ? <span className="font-normal text-muted-foreground"> · {formatFeeAmount(total, currency)}</span> : null}
      </p>
      <p className="text-xs text-muted-foreground">
        Paid, then withdrawn, demoted to the reserve list or removed. Return the money, then mark it refunded.
      </p>
      {!active ? (
        <Button size="sm" variant="outline" className="ml-auto" onClick={onShow}>
          Show
        </Button>
      ) : null}
    </div>
  );
}

export function PaymentsAdmin({ payments, isFullAdmin }: { payments: PaymentRow[]; isFullAdmin: boolean }) {
  const { formatDate, formatDateTime } = useFormatters();
  const formatDue = (date: Date) =>
    date.getHours() === 0 && date.getMinutes() === 0 ? formatDate(date) : formatDateTime(date);

  // One haystack per row so a single box finds a payment by anything shown in
  // it. Dates go in formatted, so "30. 9." matches what the user reads.
  const paymentSearchText = (p: PaymentRow) =>
    [
      p.memberName,
      p.memberId ? "" : "guest",
      p.type === "event" ? "event" : "membership fee",
      p.eventTitle,
      p.periodLabel,
      paymentStatusLabel[p.status],
      p.memberGroups.map((g) => g.name).join(" "),
      p.variableSymbol,
      formatFeeAmount(p.amount, p.currency),
      formatDue(p.dueAt),
      p.paidAt ? formatDate(p.paidAt) : "",
    ]
      .filter(Boolean)
      .join(" ");

  const router = useRouter();
  const [detailPayment, setDetailPayment] = useState<PaymentRow | null>(null);
  const [groupId, setGroupId] = useState<string>(ALL_GROUPS);
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>(null);

  const refunds = useMemo(() => payments.filter((p) => p.status === "refund_due"), [payments]);
  const hasEventPayments = useMemo(() => payments.some((p) => p.type === "event"), [payments]);

  // Options come from the rows on screen rather than from every group in the
  // org, so the dropdown can never offer a group that would filter to nothing.
  const groupOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const payment of payments) {
      for (const group of payment.memberGroups) byId.set(group.id, group.name);
    }
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [payments]);

  // Type and group narrow the set the chips count; the status chip then
  // narrows the table only.
  const scopedPayments = useMemo(
    () =>
      payments
        .filter((payment) => type === "all" || payment.type === type)
        .filter(
          (payment) => groupId === ALL_GROUPS || payment.memberGroups.some((g) => g.id === groupId),
        ),
    [payments, groupId, type],
  );
  const visiblePayments = useMemo(
    () => (status ? scopedPayments.filter((p) => p.status === status) : scopedPayments),
    [scopedPayments, status],
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
      cell: ({ row }) =>
        row.original.memberId ? (
          row.original.memberName
        ) : (
          <span>
            {row.original.memberName}
            <span className="ml-1 text-xs text-muted-foreground">guest</span>
          </span>
        ),
    }),
    columnHelper.accessor("periodLabel", {
      header: ({ column }) => <SortableHeader column={column}>Payment</SortableHeader>,
      meta: { label: "Payment" },
      // Same naming as the member's card: the kind, then what it is for.
      cell: ({ row }) => {
        const isEvent = row.original.type === "event";
        const label = (
          <span className="flex items-center gap-2">
            {isEvent ? (
              <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <IdCardIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="truncate">
              <span className="text-muted-foreground">{isEvent ? "Event" : "Membership"} · </span>
              {isEvent ? (row.original.eventTitle ?? row.original.periodLabel) : row.original.periodLabel}
            </span>
          </span>
        );
        return isEvent && row.original.eventId ? (
          <Link
            href={`/admin/events/${row.original.eventId}?tab=responses`}
            className="underline-offset-4 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {label}
          </Link>
        ) : (
          label
        );
      },
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
          <span className="font-mono text-xs tabular-nums">{row.original.variableSymbol}</span>
        ) : (
          "—"
        ),
    }),
    columnHelper.accessor("dueAt", {
      header: ({ column }) => <SortableHeader column={column}>Due</SortableHeader>,
      meta: { label: "Due" },
      // A midnight deadline is a day, not a moment — showing "0:00" on every
      // membership fee just adds noise.
      cell: ({ row }) => formatDue(row.original.dueAt),
    }),
    columnHelper.accessor("paidAt", {
      header: ({ column }) => <SortableHeader column={column}>Paid at</SortableHeader>,
      meta: { label: "Paid at" },
      cell: ({ row }) => (row.original.paidAt ? formatDate(row.original.paidAt) : null),
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
      <RefundsDue refunds={refunds} active={status === "refund_due"} onShow={() => setStatus("refund_due")} />
      <PaymentSummary payments={scopedPayments} status={status} onStatusChange={setStatus} />
      <DataTable
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        data={visiblePayments}
        searchText={paymentSearchText}
        searchPlaceholder="Search member, event, status, group, VS, date…"
        emptyStateTitle="No payment records"
        emptyStateDescription="Generate payment records for the current renewal period or wait for the nightly cron."
        onRowClick={(payment) => setDetailPayment(payment)}
        rowClassName={(payment) =>
          payment.status === "refund_due" ? "bg-orange-500/5 hover:bg-orange-500/10" : undefined
        }
        toolbarActions={(table) => {
          const selected = table
            .getFilteredSelectedRowModel()
            .rows.map((r) => (r.original as PaymentRow).id);

          return (
            <>
              {hasEventPayments && (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={type}
                  onValueChange={(value) => value && setType(value as TypeFilter)}
                  aria-label="Filter by payment type"
                >
                  <ToggleGroupItem value="all">All</ToggleGroupItem>
                  <ToggleGroupItem value="membership_fee">Membership fees</ToggleGroupItem>
                  <ToggleGroupItem value="event">Events</ToggleGroupItem>
                </ToggleGroup>
              )}
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
