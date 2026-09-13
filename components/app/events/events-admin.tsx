"use client";

import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarPlusIcon,
  ClockIcon,
  MapPinIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { EventSheet } from "@/components/app/events/event-sheet";
import type { OwnerOptions } from "@/components/app/events/event-form";
import { StatusFilter } from "@/components/app/status-filter";
import { useFormatters } from "@/components/locale-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  EVENT_STATUS_OPTIONS,
  eventStatusDotVariant,
  eventVisibilityLabel,
  formatEventWhen,
} from "@/lib/events/display";
import type { EventInput } from "@/lib/events/schemas";
import { cn } from "@/lib/utils";
import { createEventAction, deleteEventsAction } from "@/server/actions/events";
import type { EventStatus } from "@/server/db/schema";
import type { EventListItem } from "@/server/queries/events";

type Row = EventListItem & {
  search: string;
  ownerKey: string;
  /** Epoch ms for sorting; `null` (date TBA) sorts last in both directions. */
  startsMs: number | null;
};

type TimeWindow = "upcoming" | "past";
type OwnerOption = { value: string; label: string };

const columnHelper = createColumnHelper<Row>();
const ALL_STATUSES = EVENT_STATUS_OPTIONS.map((o) => o.value);

/**
 * Default order. Drafts first: an unfinished event is the one the manager
 * most likely came here to finish. Within a status, soonest first.
 */
const STATUS_RANK: Record<EventStatus, number> = { draft: 0, published: 1, cancelled: 2 };
const DEFAULT_SORTING = [
  { id: "status", desc: false },
  { id: "starts", desc: false },
];

/** Ends when `endsAt` says so, else at the end of the start day. */
function isPast(item: EventListItem, now: number) {
  const end = item.event.endsAt ?? item.event.startsAt;
  if (!end) return false;
  const endMs = new Date(end).getTime();
  return (item.event.endsAt ? endMs : endMs + 24 * 60 * 60 * 1000) < now;
}

export function EventsAdmin({
  items,
  owners,
  canCreate,
  timeZone,
  now,
}: {
  items: EventListItem[];
  owners: OwnerOptions;
  canCreate: boolean;
  timeZone: string;
  /** Server time at render, so "upcoming" is decided once and hydrates identically. */
  now: number;
}) {
  const router = useRouter();
  const { locale } = useFormatters();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [window, setWindow] = useState<TimeWindow>("upcoming");
  const [statuses, setStatuses] = useState<EventStatus[]>(ALL_STATUSES);
  const [owner, setOwner] = useState<OwnerOption | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);

  const deleteAction = useAction(deleteEventsAction, {
    onSuccess({ data }) {
      toast.success(`${data?.deleted ?? 0} event${data?.deleted === 1 ? "" : "s"} deleted.`);
      setDeleteIds(null);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not delete the events.");
    },
  });

  const createAction = useAction(createEventAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Event created as a draft.");
        setSheetOpen(false);
        router.push(`/admin/events/${data.eventId}`);
      }
    },
  });

  const tally = useMemo(() => {
    let upcoming = 0;
    let past = 0;
    for (const item of items) {
      if (isPast(item, now)) past += 1;
      else upcoming += 1;
    }
    return { upcoming, past };
  }, [items, now]);

  const rows = useMemo<Row[]>(
    () =>
      items
        .filter((item) => (window === "past") === isPast(item, now))
        .filter((item) => statuses.includes(item.event.status))
        .map((item) => ({
          ...item,
          search: [item.event.title, item.event.slug, item.ownerName ?? ""].join(" "),
          ownerKey:
            item.event.ownerType === "organization"
              ? "organization"
              : item.event.ownerType === "category"
                ? `category:${item.event.ownerCategoryId}`
                : `group:${item.event.ownerGroupId}`,
          startsMs: item.event.startsAt ? new Date(item.event.startsAt).getTime() : null,
        }))
        .filter((row) => owner == null || row.ownerKey === owner.value),
    [items, window, statuses, owner, now],
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        meta: { label: "Select" },
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      }),
      columnHelper.accessor("search", {
        id: "event",
        meta: { label: "Event" },
        header: ({ column }) => <SortableHeader column={column}>Event</SortableHeader>,
        sortingFn: (a, b) => a.original.event.title.localeCompare(b.original.event.title),
        cell: ({ row }) => {
          const { event, ownerName } = row.original;
          const when = formatEventWhen(event, locale, timeZone);
          const where = event.locationName ?? event.locationAddress;
          return (
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={`/admin/events/${event.id}`}
                  className={cn(
                    "truncate font-medium text-foreground hover:underline",
                    event.status === "cancelled" && "text-muted-foreground line-through decoration-1",
                  )}
                >
                  {event.title}
                </Link>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ClockIcon className="size-3" aria-hidden />
                    {when ?? "Date TBA"}
                  </span>
                  {where ? (
                    <span className="flex items-center gap-1">
                      <MapPinIcon className="size-3" aria-hidden />
                      <span className="truncate">{where}</span>
                    </span>
                  ) : null}
                  <span>{ownerName ?? "Whole organization"}</span>
                </span>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor((row) => row.event.status, {
        id: "status",
        meta: { label: "Status" },
        header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
        sortingFn: (a, b) => STATUS_RANK[a.original.event.status] - STATUS_RANK[b.original.event.status],
        cell: (info) => (
          <Status variant={eventStatusDotVariant[info.getValue()]}>
            <StatusIndicator />
            <StatusLabel className="capitalize">{info.getValue()}</StatusLabel>
          </Status>
        ),
      }),
      columnHelper.accessor((row) => row.event.visibility, {
        id: "visibility",
        meta: { label: "Visibility" },
        header: ({ column }) => <SortableHeader column={column}>Visibility</SortableHeader>,
        sortingFn: (a, b) =>
          eventVisibilityLabel[a.original.event.visibility].localeCompare(
            eventVisibilityLabel[b.original.event.visibility],
          ),
        cell: (info) => <Badge variant="outline">{eventVisibilityLabel[info.getValue()]}</Badge>,
      }),
      // Hidden: exists so the default sort has a date to fall back on within a
      // status. Nulls (date TBA) always sort last.
      columnHelper.accessor("startsMs", {
        id: "starts",
        meta: { label: "Starts" },
        header: "Starts",
        enableHiding: false,
        sortingFn: (a, b) => {
          const x = a.original.startsMs;
          const y = b.original.startsMs;
          if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
          return x - y;
        },
        cell: () => null,
      }),
      columnHelper.accessor("confirmedSeats", {
        id: "going",
        meta: { label: "Going" },
        header: ({ column }) => <SortableHeader column={column}>Going</SortableHeader>,
        cell: ({ row }) => {
          const { confirmedSeats, event } = row.original;
          const ratio = event.capacity ? Math.min(1, confirmedSeats / event.capacity) : null;
          return (
            <div className="flex w-28 flex-col gap-1">
              <span className="tabular-nums">
                {confirmedSeats}
                {event.capacity ? <span className="text-muted-foreground"> / {event.capacity}</span> : null}
              </span>
              {ratio != null ? (
                <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn("block h-full rounded-full", ratio >= 1 ? "bg-amber-500" : "bg-primary")}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </span>
              ) : null}
            </div>
          );
        },
      }),
      columnHelper.accessor("reserveCount", {
        id: "reserve",
        meta: { label: "Reserve" },
        header: ({ column }) => <SortableHeader column={column}>Reserve</SortableHeader>,
        cell: (info) =>
          info.getValue() ? (
            <span className="font-medium tabular-nums text-amber-700 dark:text-amber-500">{info.getValue()}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button asChild size="icon-sm" variant="ghost" aria-label="Open event">
              <Link href={`/admin/events/${row.original.event.id}`}>
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        ),
      }),
    ],
    [locale, timeZone],
  );

  const ownerOptions = useMemo<OwnerOption[]>(
    () => [
      ...(owners.organization ? [{ value: "organization", label: "Whole organization" }] : []),
      ...owners.categories.map((c) => ({ value: `category:${c.id}`, label: c.name })),
      ...owners.groups.map((g) => ({ value: `group:${g.id}`, label: g.name })),
    ],
    [owners],
  );

  const filtered = statuses.length !== ALL_STATUSES.length || owner != null;
  const emptyTitle = filtered
    ? "Nothing matches these filters"
    : window === "upcoming"
      ? "Nothing coming up"
      : "No past events";
  const emptyDescription = filtered
    ? "Loosen the status or owner filter to see more."
    : window === "upcoming"
      ? canCreate
        ? "Create one — it starts as a draft nobody else can see."
        : "Events you manage will appear here."
      : "Finished events land here once their date has passed.";

  return (
    <div className="flex flex-col gap-6">
      <DataTable
        data={rows}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="event"
        searchPlaceholder="Search events..."
        emptyStateTitle={emptyTitle}
        emptyStateDescription={emptyDescription}
        initialSorting={DEFAULT_SORTING}
        initialColumnVisibility={{ starts: false }}
        enableRowSelection
        onRowClick={(row) => router.push(`/admin/events/${row.event.id}`)}
        toolbarActions={(table) => {
          const selected = table.getFilteredSelectedRowModel().rows;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={window}
                onValueChange={(v) => v && setWindow(v as TimeWindow)}
                aria-label="Time window"
              >
                <ToggleGroupItem value="upcoming" className="gap-1.5 px-3">
                  Upcoming
                  <span className="text-xs tabular-nums text-muted-foreground">{tally.upcoming}</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="past" className="gap-1.5 px-3">
                  Past
                  <span className="text-xs tabular-nums text-muted-foreground">{tally.past}</span>
                </ToggleGroupItem>
              </ToggleGroup>
              <StatusFilter options={EVENT_STATUS_OPTIONS} value={statuses} onChange={setStatuses} />
              {ownerOptions.length > 1 ? (
                <Combobox
                  items={ownerOptions}
                  value={owner}
                  onValueChange={(next: OwnerOption | null) => setOwner(next)}
                  itemToStringLabel={(item: OwnerOption) => item.label}
                >
                  <ComboboxInput className="w-48" placeholder="All owners" aria-label="Filter by owner" showClear={owner != null} />
                  <ComboboxContent>
                    <ComboboxEmpty>No owner matches.</ComboboxEmpty>
                    <ComboboxList>
                      {(item: OwnerOption) => (
                        <ComboboxItem key={item.value} value={item}>
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              ) : null}
              {canCreate ? (
                <Button onClick={() => setSheetOpen(true)}>
                  <PlusIcon data-icon="inline-start" />
                  New event
                </Button>
              ) : null}
              {selected.length > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteIds(selected.map((r) => r.original.event.id))}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Delete selected
                </Button>
              ) : null}
            </div>
          );
        }}
      />

      <AlertDialog open={deleteIds != null} onOpenChange={(open) => !open && setDeleteIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Delete {deleteIds?.length ?? 0} selected event{deleteIds?.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They disappear from every list, including the portal. Responses are kept for the retention period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAction.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteAction.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteIds) deleteAction.execute({ eventIds: deleteIds });
              }}
            >
              {deleteAction.isPending ? "Deleting..." : "Delete selected"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {items.length === 0 && canCreate ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <CalendarPlusIcon className="size-5 text-muted-foreground" aria-hidden />
          <p className="font-heading text-lg">Your first event</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Start as a draft, set the audience, then publish. Invites only go out when you send them from the
            Emails tab.
          </p>
          <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
            Create an event
          </Button>
        </div>
      ) : null}

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
