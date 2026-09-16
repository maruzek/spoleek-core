"use client";

import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { useFormatters } from "@/components/locale-provider";
import { PaymentActions } from "@/components/app/payments/payment-actions";
import { PaymentStatusBadge } from "@/components/app/payments/payment-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { StatusFilter, type StatusFilterOption } from "@/components/app/status-filter";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { eventAnswerLabel } from "@/lib/events/display";
import { formatFeeAmount } from "@/lib/payments";
import { STATUS_DOT_CLASSES } from "@/lib/status-dot";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import {
  bulkMarkEventPaymentsPaidAction,
  removeResponseAction,
  setResponseStandingAction,
} from "@/server/actions/events";
import type { EventCounts, EventResponseRow } from "@/server/queries/events";
import type { MemberPaymentStatus } from "@/server/db/schema";

type Row = EventResponseRow & { name: string; email: string; search: string; outcome: ResponseOutcome };

/** Answer × standing collapsed into the one status the table filters on. */
type ResponseOutcome = "going" | "reserve" | "maybe" | "no";

/** Payment filter: the live statuses plus "not charged" for rows without one. */
type PaymentFilter = MemberPaymentStatus | "none";

const PAYMENT_OPTIONS: StatusFilterOption<PaymentFilter>[] = [
  { value: "pending", label: "Pending", dotClassName: "bg-blue-500" },
  { value: "overdue", label: "Overdue", dotClassName: STATUS_DOT_CLASSES.error },
  { value: "paid", label: "Paid", dotClassName: STATUS_DOT_CLASSES.success },
  { value: "refund_due", label: "Refund due", dotClassName: "bg-purple-500" },
  { value: "cancelled", label: "Cancelled", dotClassName: STATUS_DOT_CLASSES.default },
  { value: "none", label: "Not charged", dotClassName: STATUS_DOT_CLASSES.default },
];

const ALL_PAYMENT_FILTERS = PAYMENT_OPTIONS.map((o) => o.value);

function paymentFilterOf(r: EventResponseRow): PaymentFilter {
  return r.payment?.status ?? "none";
}

const columnHelper = createColumnHelper<Row>();

/** Badge variant per answer; the filter dots below use the same variants. */
const ANSWER_VARIANT: Record<EventResponseRow["answer"], "success" | "info" | "default"> = {
  yes: "success",
  maybe: "info",
  no: "default",
};

const OUTCOME_OPTIONS: StatusFilterOption<ResponseOutcome>[] = [
  { value: "going", label: "Going", dotClassName: STATUS_DOT_CLASSES.success },
  { value: "reserve", label: "Reserve", dotClassName: STATUS_DOT_CLASSES.warning },
  { value: "maybe", label: "Maybe", dotClassName: STATUS_DOT_CLASSES.info },
  { value: "no", label: "Not going", dotClassName: STATUS_DOT_CLASSES.default },
];

const ALL_OUTCOMES = OUTCOME_OPTIONS.map((o) => o.value);

function outcomeOf(r: EventResponseRow): ResponseOutcome {
  if (r.answer === "yes") return r.standing === "reserve" ? "reserve" : "going";
  return r.answer;
}

export function EventResponsesPanel({
  eventId,
  capacity,
  priced,
  responses,
  counts,
}: {
  eventId: string;
  capacity: number | null;
  /** Whether the event carries a price; the payment column hides otherwise. */
  priced: boolean;
  responses: EventResponseRow[];
  counts: EventCounts;
}) {
  const router = useRouter();
  const { formatDateTime, formatDate } = useFormatters();
  const [outcomes, setOutcomes] = useState<ResponseOutcome[]>(ALL_OUTCOMES);
  const [paymentFilters, setPaymentFilters] = useState<PaymentFilter[]>(ALL_PAYMENT_FILTERS);
  // Payments exist even on a now-free event (paid rows are kept), so the
  // column shows whenever there is something to show.
  const showPayments = priced || responses.some((r) => r.payment);

  const bulkPaid = useAction(bulkMarkEventPaymentsPaidAction, {
    onSuccess({ data }) {
      toast.success(
        data?.skipped
          ? `${data.updated} marked as paid, ${data.skipped} skipped.`
          : `${data?.updated ?? 0} marked as paid.`,
      );
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not mark the payments as paid.");
    },
  });

  const standingAction = useAction(setResponseStandingAction, {
    onSuccess() {
      toast.success("Place confirmed.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(
        error.serverError === "CAPACITY_EXCEEDED"
          ? "Not enough free places for this party."
          : (error.serverError ?? "Could not change the standing."),
      );
    },
  });
  const removeAction = useAction(removeResponseAction, {
    onSuccess() {
      router.refresh();
    },
  });

  const rows = useMemo<Row[]>(
    () =>
      responses
        .filter((r) => outcomes.includes(outcomeOf(r)))
        .filter((r) => !showPayments || paymentFilters.includes(paymentFilterOf(r)))
        .map((r) => {
          const name = r.member ? getMemberDisplayName(r.member) : (r.guestName ?? "Anonymised guest");
          const email = r.member ? (r.member.email ?? "") : (r.guestEmail ?? "");
          return { ...r, name, email, search: `${name} ${email}`, outcome: outcomeOf(r) };
        }),
    [responses, outcomes, paymentFilters, showPayments],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor("search", {
        id: "person",
        header: "Person",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.email}
              {!row.original.member ? " · guest" : null}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor("answer", {
        header: "Answer",
        cell: (info) => (
          <Status variant={ANSWER_VARIANT[info.getValue()]}>
            <StatusIndicator />
            <StatusLabel>{eventAnswerLabel[info.getValue()]}</StatusLabel>
          </Status>
        ),
      }),
      columnHelper.accessor("guestCount", {
        header: () => <span className="block text-right">Party</span>,
        cell: (info) => (
          <span className="block text-right tabular-nums">
            {1 + info.getValue()}
            {info.getValue() > 0 ? (
              <span className="ml-1 text-xs text-muted-foreground">(+{info.getValue()})</span>
            ) : null}
          </span>
        ),
      }),
      columnHelper.accessor("standing", {
        header: "Standing",
        cell: ({ row }) =>
          row.original.answer !== "yes" ? (
            <span className="text-muted-foreground">—</span>
          ) : row.original.standing === "confirmed" ? (
            <Badge variant="outline">Confirmed</Badge>
          ) : (
            <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-500">Reserve</Badge>
          ),
      }),
      columnHelper.accessor("respondedAt", {
        header: "Responded",
        cell: (info) => <span className="tabular-nums text-muted-foreground">{formatDateTime(info.getValue())}</span>,
      }),
      ...(showPayments
        ? [
            columnHelper.accessor((row) => row.payment?.status ?? "", {
              id: "payment",
              header: "Payment",
              cell: ({ row }) => {
                const payment = row.original.payment;
                if (!payment) return <span className="text-muted-foreground">—</span>;
                return (
                  <div className="flex flex-col gap-0.5">
                    <PaymentStatusBadge status={payment.status} className="w-fit" />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatFeeAmount(payment.amount, payment.currency)}
                      {payment.status === "paid" && payment.paidAt
                        ? ` · ${formatDate(payment.paidAt)}`
                        : payment.status === "pending" || payment.status === "overdue"
                          ? ` · due ${formatDate(payment.dueAt)}`
                          : ""}
                    </span>
                  </div>
                );
              },
            }),
          ]
        : []),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {row.original.payment ? (
              <PaymentActions
                scope="event"
                payment={{
                  ...row.original.payment,
                  type: "event",
                  memberName: row.original.name,
                }}
                onSuccess={() => router.refresh()}
              />
            ) : null}
            {row.original.answer === "yes" && row.original.standing === "reserve" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={standingAction.isPending}
                onClick={() =>
                  standingAction.execute({ eventId, responseId: row.original.id, standing: "confirmed" })
                }
              >
                Confirm place
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              disabled={removeAction.isPending}
              onClick={() => removeAction.execute({ eventId, responseId: row.original.id })}
            >
              Remove
            </Button>
          </div>
        ),
      }),
    ],
    [eventId, formatDate, formatDateTime, removeAction, router, showPayments, standingAction],
  );

  const allShown =
    outcomes.length === ALL_OUTCOMES.length &&
    (!showPayments || paymentFilters.length === ALL_PAYMENT_FILTERS.length);

  return (
    <div className="flex flex-col gap-4">
      {showPayments ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {counts.paidCount} of {counts.chargedCount} paid
          </span>
          {counts.currency ? (
            <>
              {" · "}
              {formatFeeAmount(counts.collectedMinor, counts.currency)} collected
              {" · "}
              <span className={counts.outstandingMinor > 0 ? "text-amber-700 dark:text-amber-500" : undefined}>
                {formatFeeAmount(counts.outstandingMinor, counts.currency)} outstanding
              </span>
            </>
          ) : null}
        </p>
      ) : null}
      <DataTable
        data={rows}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="person"
        searchPlaceholder="Search responses..."
        emptyStateTitle={allShown ? "No responses yet" : "Nobody here"}
        emptyStateDescription={allShown ? "Answers appear here as people respond." : "No response matches this filter."}
        enableRowSelection={
          showPayments
            ? (row) => {
                const status = (row.original as Row).payment?.status;
                return status === "pending" || status === "overdue";
              }
            : false
        }
        toolbarActions={(table) => {
          const selected = table
            .getFilteredSelectedRowModel()
            .rows.flatMap((r) => (r.original as Row).payment?.id ?? []);
          return (
            <>
              <StatusFilter options={OUTCOME_OPTIONS} value={outcomes} onChange={setOutcomes} ariaLabel="Filter by answer" />
              {showPayments ? (
                <StatusFilter
                  options={PAYMENT_OPTIONS}
                  value={paymentFilters}
                  onChange={setPaymentFilters}
                  ariaLabel="Filter by payment"
                />
              ) : null}
              {selected.length > 0 ? (
                <Button
                  variant="outline"
                  disabled={bulkPaid.isPending}
                  onClick={() => bulkPaid.execute({ eventId, paymentIds: selected })}
                >
                  <CheckIcon data-icon="inline-start" />
                  {bulkPaid.isPending ? "Marking…" : `Mark ${selected.length} as paid`}
                </Button>
              ) : null}
            </>
          );
        }}
      />
      {counts.reserveCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {counts.confirmedSeats}
          {capacity ? ` of ${capacity}` : ""} places taken. The reserve list is in order of response; promotion is
          manual.
        </p>
      ) : null}
    </div>
  );
}
