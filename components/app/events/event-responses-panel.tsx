"use client";

import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { useFormatters } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { eventAnswerLabel } from "@/lib/events/display";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { removeResponseAction, setResponseStandingAction } from "@/server/actions/events";
import type { EventResponseRow } from "@/server/queries/events";

type Row = EventResponseRow & { name: string; email: string; search: string };

const columnHelper = createColumnHelper<Row>();

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
      responses.map((r) => {
        const name = r.member ? getMemberDisplayName(r.member) : (r.guestName ?? "Anonymised guest");
        const email = r.member ? (r.member.email ?? "") : (r.guestEmail ?? "");
        return { ...r, name, email, search: `${name} ${email}` };
      }),
    [responses],
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
          <Badge variant={info.getValue() === "yes" ? "default" : "secondary"}>{eventAnswerLabel[info.getValue()]}</Badge>
        ),
      }),
      columnHelper.accessor("guestCount", {
        header: "Guests",
        cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
      }),
      columnHelper.accessor("standing", {
        header: "Standing",
        cell: ({ row }) =>
          row.original.answer !== "yes" ? (
            <span className="text-muted-foreground">—</span>
          ) : row.original.standing === "confirmed" ? (
            <Badge variant="outline">Confirmed</Badge>
          ) : (
            <Badge variant="destructive">Reserve</Badge>
          ),
      }),
      columnHelper.accessor("respondedAt", {
        header: "Responded",
        cell: (info) => formatDateTime(info.getValue()),
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

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-semibold">{counts.confirmedSeats}</span> confirmed
        {capacity ? ` of ${capacity}` : ""}, <span className="font-semibold">{counts.reserveCount}</span> in reserve.
        {counts.reserveCount > 0 ? " Reserve is listed in order of response; promotion is manual." : ""}
      </p>
      <DataTable
        data={rows}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="person"
        searchPlaceholder="Search responses..."
        emptyStateTitle="No responses yet"
        emptyStateDescription="Answers appear here as people respond."
      />
    </div>
  );
}
