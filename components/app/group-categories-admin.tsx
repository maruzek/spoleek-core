"use client";

import { useMemo, useState } from "react";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  ArrowRightIcon,
  ClipboardListIcon,
  CoinsIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  ShieldCheckIcon,
  TableIcon,
} from "lucide-react";
import { toast } from "sonner";

import { GroupCategorySheet } from "@/components/app/group-category-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePaletteIntent } from "@/hooks/use-palette-intent";
import { describeCategoryMembership, describeJoinPolicy } from "@/lib/group-category-display";
import type { GroupCategoryFormValues } from "@/lib/groups";
import { matchesSearch } from "@/lib/search";
import { saveGroupCategoryAction } from "@/server/actions/groups";

type GroupCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  registrationFieldLabel: string | null;
  isActive: boolean;
  isPinnedToNavigation: boolean;
  showInRegistration: boolean;
  showInMembersTable: boolean;
  groupAdminsManageMembers: boolean;
  managesMembershipFees: boolean;
  selectionMode: "single" | "multiple";
  selectionRequired: boolean;
  maxSelections: number | null;
  defaultJoinPolicy: "admin_only" | "free_join_leave" | "request_to_join";
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  groupCount: number;
  adminCount: number;
};

type Shelf = "active" | "archived";

const columnHelper = createColumnHelper<GroupCategoryRow>();

/** Where a category surfaces outside this page, as tooltip-bearing chips. */
function categorySurfaces(category: GroupCategoryRow) {
  return [
    category.showInRegistration && {
      key: "registration",
      icon: ClipboardListIcon,
      label: "Registration",
      hint: category.registrationFieldLabel
        ? `Asked at sign-up as “${category.registrationFieldLabel}”`
        : "Asked at sign-up",
    },
    category.showInMembersTable && {
      key: "members-table",
      icon: TableIcon,
      label: "Members table",
      hint: "Shown as a column in the members table",
    },
    category.isPinnedToNavigation && {
      key: "pinned",
      icon: PinIcon,
      label: "Pinned",
      hint: "Listed under Groups in the sidebar",
    },
    category.groupAdminsManageMembers && {
      key: "scoped",
      icon: ShieldCheckIcon,
      label: "Scoped admins",
      hint: "Group admins can manage the members of their own group",
    },
    category.managesMembershipFees && {
      key: "fees",
      icon: CoinsIcon,
      label: "Fees",
      hint: "Membership fees are collected per group in this category",
    },
  ].filter((surface): surface is Exclude<typeof surface, false> => Boolean(surface));
}

export function GroupCategoriesAdmin({
  categories,
  canManageCategories,
}: {
  categories: GroupCategoryRow[];
  canManageCategories: boolean;
}) {
  const router = useRouter();
  const [sheetState, setSheetState] = useState<{
    open: boolean;
    category: GroupCategoryRow | null;
  }>({ open: false, category: null });
  const { initialSearch } = usePaletteIntent("new", () =>
    setSheetState({ open: true, category: null }),
  );
  const [shelf, setShelf] = useState<Shelf>("active");

  const saveAction = useAction(saveGroupCategoryAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success(sheetState.category ? "Category updated." : "Category created.");
        setSheetState({ open: false, category: null });
        router.refresh();
      }
    },
  });

  const tally = useMemo(
    () => ({
      active: categories.filter((c) => c.isActive).length,
      archived: categories.filter((c) => !c.isActive).length,
    }),
    [categories],
  );
  const rows = useMemo(
    () => categories.filter((c) => c.isActive === (shelf === "active")),
    [categories, shelf],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.name, {
        id: "category",
        meta: { label: "Category" },
        header: ({ column }) => <SortableHeader column={column}>Category</SortableHeader>,
        filterFn: (row, _id, value: string) =>
          matchesSearch(
            [row.original.name, row.original.slug, row.original.description ?? ""].join(" "),
            value ?? "",
          ),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link
              href={`/admin/groups/${row.original.id}`}
              className="truncate font-medium text-foreground hover:underline"
            >
              {row.original.name}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {row.original.description ?? row.original.slug}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor("selectionMode", {
        id: "rules",
        meta: { label: "Membership" },
        header: "Membership",
        enableSorting: false,
        cell: ({ row }) => {
          const surfaces = categorySurfaces(row.original);
          return (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm">
                {describeCategoryMembership(row.original)}{" "}
                <span className="text-muted-foreground">
                  {describeJoinPolicy(row.original.defaultJoinPolicy)}
                </span>
              </span>
              {surfaces.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {surfaces.map(({ key, icon: Icon, label, hint }) => (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="cursor-default text-muted-foreground">
                          <Icon data-icon="inline-start" aria-hidden />
                          {label}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{hint}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ) : null}
            </div>
          );
        },
      }),
      columnHelper.accessor("groupCount", {
        meta: { label: "Groups" },
        header: ({ column }) => <SortableHeader column={column}>Groups</SortableHeader>,
        cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
      }),
      columnHelper.accessor("adminCount", {
        meta: { label: "Category admins" },
        header: ({ column }) => <SortableHeader column={column}>Category admins</SortableHeader>,
        cell: (info) =>
          info.getValue() > 0 ? (
            <span className="tabular-nums">{info.getValue()}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      columnHelper.accessor("isActive", {
        meta: { label: "Status" },
        header: "Status",
        enableSorting: false,
        cell: (info) => (
          <Status variant={info.getValue() ? "success" : "default"}>
            <StatusIndicator />
            <StatusLabel>{info.getValue() ? "Active" : "Archived"}</StatusLabel>
          </Status>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {canManageCategories ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Edit ${row.original.name}`}
                onClick={() => setSheetState({ open: true, category: row.original })}
              >
                <PencilIcon />
              </Button>
            ) : null}
            <Button asChild size="icon-sm" variant="ghost" aria-label={`Open ${row.original.name}`}>
              <Link href={`/admin/groups/${row.original.id}`}>
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        ),
      }),
    ],
    [canManageCategories],
  );

  return (
    <div className="flex flex-col gap-6">
      <DataTable
        data={rows}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="category"
        initialSearch={initialSearch}
        searchPlaceholder="Search categories..."
        emptyStateTitle={shelf === "archived" ? "No archived categories" : "No group categories yet"}
        emptyStateDescription={
          shelf === "archived"
            ? "Archived categories keep their groups but leave the registration form and member tables."
            : "Start by defining the top-level structure your organization uses."
        }
        onRowClick={(row) => router.push(`/admin/groups/${row.id}`)}
        toolbarActions={() => (
          <div className="flex flex-wrap items-center gap-2">
            {tally.archived > 0 ? (
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={shelf}
                onValueChange={(v) => v && setShelf(v as Shelf)}
                aria-label="Show"
              >
                <ToggleGroupItem value="active" className="gap-1.5 px-3">
                  Active
                  <span className="text-xs tabular-nums text-muted-foreground">{tally.active}</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="archived" className="gap-1.5 px-3">
                  Archived
                  <span className="text-xs tabular-nums text-muted-foreground">{tally.archived}</span>
                </ToggleGroupItem>
              </ToggleGroup>
            ) : null}
            {canManageCategories ? (
              <Button onClick={() => setSheetState({ open: true, category: null })}>
                <PlusIcon data-icon="inline-start" />
                New category
              </Button>
            ) : null}
          </div>
        )}
      />

      <GroupCategorySheet
        key={sheetState.category?.id ?? "new-category"}
        open={sheetState.open}
        category={sheetState.category}
        isPending={saveAction.isPending}
        validationErrors={saveAction.result.validationErrors}
        onOpenChange={(open) => setSheetState((current) => ({ ...current, open }))}
        onSubmit={async (value: GroupCategoryFormValues) => {
          const result = await saveAction.executeAsync(value);

          if (result?.serverError) {
            toast.error(result.serverError);
          }
        }}
      />
    </div>
  );
}
