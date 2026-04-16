"use client";

import { useMemo, useState } from "react";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { GroupCategorySheet } from "@/components/app/group-category-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { saveGroupCategoryAction } from "@/server/actions/groups";
import type { GroupCategoryFormValues } from "@/lib/groups";

type GroupCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  registrationFieldLabel: string | null;
  isActive: boolean;
  isPinnedToNavigation: boolean;
  showInRegistration: boolean;
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

const columnHelper = createColumnHelper<GroupCategoryRow>();

export function GroupCategoriesAdmin({ categories }: { categories: GroupCategoryRow[] }) {
  const router = useRouter();
  const [sheetState, setSheetState] = useState<{
    open: boolean;
    category: GroupCategoryRow | null;
  }>({
    open: false,
    category: null,
  });

  const saveAction = useAction(saveGroupCategoryAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success(sheetState.category ? "Category updated." : "Category created.");
        setSheetState({ open: false, category: null });
        router.refresh();
      }
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value: boolean | "indeterminate") =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value: boolean | "indeterminate") => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      }),
      columnHelper.accessor(
        (row) => [row.name, row.slug, row.description ?? ""].filter(Boolean).join(" "),
        {
          id: "category",
          header: "Category",
          cell: ({ row }) => (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">{row.original.name}</span>
              <span className="text-sm text-muted-foreground">
                {row.original.description ?? row.original.slug}
              </span>
            </div>
          ),
        },
      ),
      columnHelper.accessor("selectionMode", {
        header: "Rules",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{row.original.selectionMode}</Badge>
            {row.original.selectionRequired ? <Badge variant="outline">Required</Badge> : null}
            {row.original.maxSelections ? (
              <Badge variant="outline">Max {row.original.maxSelections}</Badge>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor("groupCount", {
        header: "Groups",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("adminCount", {
        header: "Category admins",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("isActive", {
        header: "Status",
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "secondary"}>
            {info.getValue() ? "Active" : "Archived"}
          </Badge>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSheetState({
              open: true,
              category: row.original,
            })}>
              Edit
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/admin/groups/${row.original.id}`}>Open</Link>
            </Button>
          </div>
        ),
      }),
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <DataTable
        data={categories}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="category"
        searchPlaceholder="Search categories..."
        emptyStateTitle="No group categories yet"
        emptyStateDescription="Start by defining the top-level structure your organization uses."
        toolbarActions={() => (
          <Button onClick={() => setSheetState({ open: true, category: null })}>
            <PlusIcon data-icon="inline-start" />
            New category
          </Button>
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
