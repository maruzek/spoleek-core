"use client";

import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  CalendarIcon,
  ClipboardListIcon,
  LayoutTemplateIcon,
  PlusIcon,
  UserRoundIcon,
} from "lucide-react";

import type { OwnerOptions } from "@/components/app/events/event-wizard/types";
import { FormCreateDialog, type EventOption } from "@/components/app/forms/form-create-dialog";
import { StatusFilter } from "@/components/app/status-filter";
import { useFormatters } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { FORM_STATUS_OPTIONS, formStatusDotVariant, formTimingLabel } from "@/lib/forms/display";
import { matchesSearch } from "@/lib/search";
import type { FormStatus } from "@/server/db/schema";
import type { FormListItem } from "@/server/queries/forms";

type Row = FormListItem & { search: string; ownerKey: string };
type View = "forms" | "templates";
type OwnerOption = { value: string; label: string };

const columnHelper = createColumnHelper<Row>();
const ALL_STATUSES = FORM_STATUS_OPTIONS.map((o) => o.value);
const STATUS_RANK: Record<FormStatus, number> = { open: 0, draft: 1, closed: 2 };

function ownerKeyOf(item: FormListItem) {
  const { form } = item;
  return form.ownerType === "organization"
    ? "organization"
    : form.ownerType === "category"
      ? `category:${form.ownerCategoryId}`
      : `group:${form.ownerGroupId}`;
}

export function FormsAdmin({
  items,
  templates,
  owners,
  canCreate,
  canManageTemplates,
  events,
  timeZone,
}: {
  items: FormListItem[];
  templates: FormListItem[];
  owners: OwnerOptions;
  canCreate: boolean;
  canManageTemplates: boolean;
  events: EventOption[];
  timeZone: string;
}) {
  const router = useRouter();
  const { locale } = useFormatters();
  const [view, setView] = useState<View>("forms");
  const [statuses, setStatuses] = useState<FormStatus[]>(ALL_STATUSES);
  const [owner, setOwner] = useState<OwnerOption | null>(null);
  const [createOpen, setCreateOpen] = useState<null | "form" | "template">(null);

  const source = view === "forms" ? items : templates;

  const rows = useMemo<Row[]>(
    () =>
      source
        .filter((item) => view === "templates" || statuses.includes(item.form.status))
        .map((item) => ({
          ...item,
          search: [item.form.title, item.eventTitle ?? "", item.ownerName ?? ""].join(" "),
          ownerKey: ownerKeyOf(item),
        }))
        .filter((row) => owner == null || row.ownerKey === owner.value),
    [source, view, statuses, owner],
  );

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }),
    [locale, timeZone],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor("search", {
        id: "form",
        meta: { label: "Form" },
        header: ({ column }) => <SortableHeader column={column}>Form</SortableHeader>,
        sortingFn: (a, b) => a.original.form.title.localeCompare(b.original.form.title),
        filterFn: (row, _id, value: string) => matchesSearch(row.original.search, value ?? ""),
        cell: ({ row }) => {
          const { form, eventTitle, ownerName } = row.original;
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link href={`/admin/forms/${form.id}`} className="truncate font-medium text-foreground hover:underline">
                {form.title}
              </Link>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {eventTitle ? (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="size-3" aria-hidden />
                    <span className="truncate">{eventTitle}</span>
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <UserRoundIcon className="size-3" aria-hidden />
                  {ownerName ?? "Whole organization"}
                </span>
              </span>
            </div>
          );
        },
      }),
      ...(view === "forms"
        ? [
            columnHelper.accessor((row) => row.form.status, {
              id: "status",
              meta: { label: "Status" },
              header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
              sortingFn: (a, b) => STATUS_RANK[a.original.form.status] - STATUS_RANK[b.original.form.status],
              cell: (info) => (
                <Status variant={formStatusDotVariant[info.getValue()]}>
                  <StatusIndicator />
                  <StatusLabel className="capitalize">{info.getValue()}</StatusLabel>
                </Status>
              ),
            }),
          ]
        : []),
      columnHelper.accessor((row) => row.form.timing, {
        id: "timing",
        meta: { label: "Timing" },
        header: ({ column }) => <SortableHeader column={column}>Timing</SortableHeader>,
        cell: (info) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{formTimingLabel[info.getValue()]}</Badge>
            {info.row.original.form.required ? <Badge variant="secondary">Required</Badge> : null}
          </div>
        ),
      }),
      ...(view === "forms"
        ? [
            columnHelper.accessor("submissionCount", {
              id: "submissions",
              meta: { label: "Submissions" },
              header: ({ column }) => <SortableHeader column={column}>Submissions</SortableHeader>,
              cell: ({ row }) => (
                <span className="tabular-nums">
                  {row.original.submissionCount}
                  {row.original.pendingCount > 0 ? (
                    <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-500">
                      {row.original.pendingCount} pending
                    </span>
                  ) : null}
                </span>
              ),
            }),
            columnHelper.accessor((row) => row.form.closesAt?.getTime() ?? null, {
              id: "closes",
              meta: { label: "Closes" },
              header: ({ column }) => <SortableHeader column={column}>Closes</SortableHeader>,
              sortingFn: (a, b) => {
                const x = a.original.form.closesAt?.getTime() ?? null;
                const y = b.original.form.closesAt?.getTime() ?? null;
                if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
                return x - y;
              },
              cell: ({ row }) =>
                row.original.form.closesAt ? (
                  <span className="text-sm tabular-nums">{dateFormat.format(row.original.form.closesAt)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            }),
          ]
        : []),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button asChild size="icon-sm" variant="ghost" aria-label="Open form">
              <Link href={`/admin/forms/${row.original.form.id}`}>
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        ),
      }),
    ],
    [view, dateFormat],
  );

  const ownerOptions = useMemo<OwnerOption[]>(
    () => [
      ...(owners.organization ? [{ value: "organization", label: "Whole organization" }] : []),
      ...owners.categories.map((c) => ({ value: `category:${c.id}`, label: c.name })),
      ...owners.groups.map((g) => ({ value: `group:${g.id}`, label: g.name })),
    ],
    [owners],
  );

  const filtered = (view === "forms" && statuses.length !== ALL_STATUSES.length) || owner != null;
  const emptyTitle = filtered
    ? "Nothing matches these filters"
    : view === "forms"
      ? "No forms yet"
      : "No templates yet";
  const emptyDescription = filtered
    ? "Loosen the status or owner filter to see more."
    : view === "forms"
      ? canCreate
        ? "Create one — it starts as a draft nobody else can see."
        : "Forms you manage will appear here."
      : canManageTemplates
        ? "Save any form as a template, or start one from scratch."
        : "Templates every manager can copy will appear here.";

  return (
    <div className="flex flex-col gap-6">
      <DataTable
        data={rows}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="form"
        searchPlaceholder={view === "forms" ? "Search forms..." : "Search templates..."}
        emptyStateTitle={emptyTitle}
        emptyStateDescription={emptyDescription}
        initialSorting={view === "forms" ? [{ id: "status", desc: false }] : [{ id: "form", desc: false }]}
        onRowClick={(row) => router.push(`/admin/forms/${row.form.id}`)}
        toolbarActions={() => (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={view}
              onValueChange={(v) => v && setView(v as View)}
              aria-label="Forms or templates"
            >
              <ToggleGroupItem value="forms" className="gap-1.5 px-3">
                <ClipboardListIcon className="size-3.5" aria-hidden />
                Forms
                <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="templates" className="gap-1.5 px-3">
                <LayoutTemplateIcon className="size-3.5" aria-hidden />
                Templates
                <span className="text-xs tabular-nums text-muted-foreground">{templates.length}</span>
              </ToggleGroupItem>
            </ToggleGroup>
            {view === "forms" ? (
              <StatusFilter options={FORM_STATUS_OPTIONS} value={statuses} onChange={setStatuses} />
            ) : null}
            {view === "forms" && ownerOptions.length > 1 ? (
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
            {view === "forms" && canCreate ? (
              <Button onClick={() => setCreateOpen("form")}>
                <PlusIcon data-icon="inline-start" />
                New form
              </Button>
            ) : null}
            {view === "templates" && canManageTemplates ? (
              <Button onClick={() => setCreateOpen("template")}>
                <PlusIcon data-icon="inline-start" />
                New template
              </Button>
            ) : null}
          </div>
        )}
      />

      <FormCreateDialog
        open={createOpen != null}
        asTemplate={createOpen === "template"}
        owners={owners}
        templates={templates.map((t) => ({ id: t.form.id, title: t.form.title }))}
        events={events}
        onOpenChange={(open) => !open && setCreateOpen(null)}
        onCreated={(formId) => router.push(`/admin/forms/${formId}`)}
      />
    </div>
  );
}
