"use client";

import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { EventSheet } from "@/components/app/events/event-sheet";
import type { OwnerOptions } from "@/components/app/events/event-form";
import { useFormatters } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { eventStatusVariant, eventVisibilityLabel } from "@/lib/events/display";
import type { EventInput } from "@/lib/events/schemas";
import { createEventAction } from "@/server/actions/events";
import type { EventListItem } from "@/server/queries/events";

type Row = EventListItem & { search: string; ownerKey: string };

const columnHelper = createColumnHelper<Row>();

export function EventsAdmin({
  items,
  owners,
  canCreate,
}: {
  items: EventListItem[];
  owners: OwnerOptions;
  canCreate: boolean;
}) {
  const router = useRouter();
  const { formatDateTime } = useFormatters();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "cancelled">("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  const createAction = useAction(createEventAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Event created as a draft.");
        setSheetOpen(false);
        router.push(`/admin/events/${data.eventId}`);
      }
    },
  });

  const rows = useMemo<Row[]>(
    () =>
      items
        .map((item) => ({
          ...item,
          search: [item.event.title, item.event.slug, item.ownerName ?? ""].join(" "),
          ownerKey:
            item.event.ownerType === "organization"
              ? "organization"
              : item.event.ownerType === "category"
                ? `category:${item.event.ownerCategoryId}`
                : `group:${item.event.ownerGroupId}`,
        }))
        .filter((row) => statusFilter === "all" || row.event.status === statusFilter)
        .filter((row) => ownerFilter === "all" || row.ownerKey === ownerFilter),
    [items, statusFilter, ownerFilter],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor("search", {
        id: "event",
        header: "Event",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <Link href={`/admin/events/${row.original.event.id}`} className="font-medium text-foreground hover:underline">
              {row.original.event.title}
            </Link>
            <span className="text-sm text-muted-foreground">{row.original.ownerName ?? "Whole organization"}</span>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.event.visibility, {
        id: "visibility",
        header: "Visibility",
        cell: (info) => <Badge variant="outline">{eventVisibilityLabel[info.getValue()]}</Badge>,
      }),
      columnHelper.accessor((row) => row.event.status, {
        id: "status",
        header: "Status",
        cell: (info) => (
          <Badge variant={eventStatusVariant[info.getValue()]} className="capitalize">
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor((row) => row.event.startsAt, {
        id: "startsAt",
        header: "Starts",
        cell: (info) => (info.getValue() ? formatDateTime(info.getValue()) : <span className="text-muted-foreground">—</span>),
      }),
      columnHelper.accessor("confirmedSeats", {
        header: "Confirmed",
        cell: ({ row }) =>
          row.original.event.capacity
            ? `${row.original.confirmedSeats} / ${row.original.event.capacity}`
            : row.original.confirmedSeats,
      }),
      columnHelper.accessor("reserveCount", {
        header: "Reserve",
        cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button asChild size="sm" variant="ghost">
              <Link href={`/admin/events/${row.original.event.id}`}>Open</Link>
            </Button>
          </div>
        ),
      }),
    ],
    [formatDateTime],
  );

  const ownerOptions = [
    ...(owners.organization ? [{ key: "organization", label: "Whole organization" }] : []),
    ...owners.categories.map((c) => ({ key: `category:${c.id}`, label: c.name })),
    ...owners.groups.map((g) => ({ key: `group:${g.id}`, label: g.name })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <DataTable
        data={rows}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="event"
        searchPlaceholder="Search events..."
        emptyStateTitle="No events yet"
        emptyStateDescription="Create the first one — it starts as a draft nobody else can see."
        toolbarActions={() => (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(v: typeof statusFilter) => setStatusFilter(v)}>
              <SelectTrigger className="w-36" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-44" aria-label="Filter by owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {ownerOptions.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canCreate ? (
              <Button onClick={() => setSheetOpen(true)}>
                <PlusIcon data-icon="inline-start" />
                New event
              </Button>
            ) : null}
          </div>
        )}
      />

      <EventSheet
        open={sheetOpen}
        owners={owners}
        isPending={createAction.isPending}
        validationErrors={createAction.result.validationErrors}
        onOpenChange={setSheetOpen}
        onSubmit={async (value: EventInput) => {
          const result = await createAction.executeAsync(value);
          if (result?.serverError) toast.error(result.serverError);
        }}
      />
    </div>
  );
}
