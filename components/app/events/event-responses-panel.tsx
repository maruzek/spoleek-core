"use client";

import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { useFormatters } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { StatusFilter, type StatusFilterOption } from "@/components/app/status-filter";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { eventAnswerLabel } from "@/lib/events/display";
import { STATUS_DOT_CLASSES } from "@/lib/status-dot";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { removeResponseAction, setResponseStandingAction } from "@/server/actions/events";
import type { EventResponseRow } from "@/server/queries/events";

type Row = EventResponseRow & { name: string; email: string; search: string; outcome: ResponseOutcome };

/** Answer × standing collapsed into the one status the table filters on. */
type ResponseOutcome = "going" | "reserve" | "maybe" | "no";

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
  responses,
  counts,
}: {
  eventId: string;
  capacity: number | null;
  responses: EventResponseRow[];
  counts: { confirmedSeats: number; reserveCount: number };
}) {
  const router = useRouter();
  const { formatDateTime } = useFormatters();
  const [outcomes, setOutcomes] = useState<ResponseOutcome[]>(ALL_OUTCOMES);

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
        .map((r) => {
          const name = r.member ? getMemberDisplayName(r.member) : (r.guestName ?? "Anonymised guest");
          const email = r.member ? (r.member.email ?? "") : (r.guestEmail ?? "");
          return { ...r, name, email, search: `${name} ${email}`, outcome: outcomeOf(r) };
        }),
    [responses, outcomes],
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
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
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
    [eventId, formatDateTime, removeAction, standingAction],
  );

  const allShown = outcomes.length === ALL_OUTCOMES.length;

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        data={rows}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="person"
        searchPlaceholder="Search responses..."
        emptyStateTitle={allShown ? "No responses yet" : "Nobody here"}
        emptyStateDescription={allShown ? "Answers appear here as people respond." : "No response matches this filter."}
        toolbarActions={() => (
          <StatusFilter options={OUTCOME_OPTIONS} value={outcomes} onChange={setOutcomes} ariaLabel="Filter by answer" />
        )}
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
