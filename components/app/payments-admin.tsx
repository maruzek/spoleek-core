"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createColumnHelper } from "@tanstack/react-table";
import { CheckIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { getPaymentTitle } from "@/lib/payments";
import {
  bulkMarkPaymentsPaidAction,
  cancelPaymentAction,
  generatePaymentsAction,
  markPaymentPaidAction,
  type CancellationReason,
} from "@/server/actions/payments";
import type { MemberPaymentStatus } from "@/server/db/schema";
import type { PaymentRow } from "@/server/queries/payments";

const columnHelper = createColumnHelper<PaymentRow>();

const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  duplicate: "Duplicate payment",
  waived: "Fee waived",
  admin_error: "Admin error",
  other: "Other",
};

function PaymentStatusBadge({ status }: { status: MemberPaymentStatus }) {
  const variantMap: Record<MemberPaymentStatus, "destructive" | "secondary" | "default" | "outline"> = {
    overdue: "destructive",
    pending: "secondary",
    paid: "default",
    cancelled: "outline",
  };
  return <Badge variant={variantMap[status]}>{status}</Badge>;
}

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

function MarkPaidDialog({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentRow;
  onSuccess: () => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [paidDate, setPaidDate] = useState(todayIso);
  const [adminNote, setAdminNote] = useState("");

  const markPaid = useAction(markPaymentPaidAction, {
    onSuccess() {
      toast.success("Payment marked as paid.");
      onOpenChange(false);
      onSuccess();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not update payment.");
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark payment as paid</AlertDialogTitle>
          <AlertDialogDescription>
            Confirm that <strong>{payment.memberName}</strong> has paid{" "}
            <strong>{(payment.amount / 100).toFixed(2)} {payment.currency}</strong> for{" "}
            {getPaymentTitle(payment.type, payment.periodLabel)}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Payment date</FieldLabel>
            <Input
              type="date"
              value={paidDate}
              max={todayIso}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Note (optional)</FieldLabel>
            <Textarea
              placeholder="Optional note (e.g. bank reference, receipt ID)"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={2}
            />
          </Field>
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              markPaid.execute({
                paymentId: payment.id,
                paidAt: paidDate ? new Date(paidDate).toISOString() : undefined,
                adminNote: adminNote.trim() || undefined,
              })
            }
            disabled={markPaid.isPending}
          >
            <CheckIcon data-icon="inline-start" />
            Mark as paid
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentRow;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState<CancellationReason | "">("");
  const [adminNote, setAdminNote] = useState("");

  const cancel = useAction(cancelPaymentAction, {
    onSuccess() {
      toast.success("Payment cancelled.");
      onOpenChange(false);
      onSuccess();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not cancel payment.");
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel payment</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently cancel the payment record for{" "}
            <strong>{payment.memberName}</strong>. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Reason</FieldLabel>
            <Select value={reason} onValueChange={(v) => setReason(v as CancellationReason)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CANCELLATION_REASON_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Note (optional)</FieldLabel>
            <Textarea
              placeholder="Optional note"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={2}
            />
          </Field>
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              cancel.execute({
                paymentId: payment.id,
                cancellationReason: reason as CancellationReason,
                adminNote: adminNote.trim() || undefined,
              })
            }
            disabled={!reason || cancel.isPending}
          >
            <XIcon data-icon="inline-start" />
            Cancel payment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PaymentRowActions({ payment, onSuccess }: { payment: PaymentRow; onSuccess: () => void }) {
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (payment.status === "paid" || payment.status === "cancelled") {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => setMarkPaidOpen(true)}>
          <CheckIcon data-icon="inline-start" />
          Mark paid
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCancelOpen(true)}>
          <XIcon data-icon="inline-start" />
          Cancel
        </Button>
      </div>
      <MarkPaidDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        payment={payment}
        onSuccess={onSuccess}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        payment={payment}
        onSuccess={onSuccess}
      />
    </>
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
    </div>
  );
}
