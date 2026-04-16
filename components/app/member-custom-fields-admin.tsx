"use client";

import { useMemo, useState } from "react";

import { useForm } from "@tanstack/react-form";
import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { PlusIcon, SearchIcon, Settings2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  getFieldOptionList,
  memberCustomFieldSchema,
  memberCustomFieldStageOptions,
  memberCustomFieldTypeOptions,
  stringifyFieldOptions,
  type MemberCustomFieldFormValues,
} from "@/lib/member-custom-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  saveMemberCustomFieldAction,
  setMemberCustomFieldActiveAction,
} from "@/server/actions/member-custom-fields";
import type { MemberCustomField } from "@/server/db/schema";

type MemberCustomFieldsAdminProps = {
  fields: MemberCustomField[];
};

type SheetState = {
  open: boolean;
  field: MemberCustomField | null;
};

const columnHelper = createColumnHelper<MemberCustomField>();

function formatTypeLabel(type: MemberCustomField["type"]) {
  return memberCustomFieldTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function formatStageLabel(stage: MemberCustomField["stage"]) {
  return memberCustomFieldStageOptions.find((option) => option.value === stage)?.label ?? stage;
}

import { MemberCustomFieldSheet } from "./member-custom-field-sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";

export function MemberCustomFieldsAdmin({
  fields,
}: MemberCustomFieldsAdminProps) {
  const router = useRouter();
  const [sheetState, setSheetState] = useState<SheetState>({
    open: false,
    field: null,
  });

  const saveAction = useAction(saveMemberCustomFieldAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success(sheetState.field ? "Field updated." : "Field created.");
        setSheetState({ open: false, field: null });
        router.refresh();
      }
    },
  });
  const toggleAction = useAction(setMemberCustomFieldActiveAction, {
    onSuccess({ data }) {
      if (data?.success) {
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
            onCheckedChange={(value: boolean | "indeterminate") => table.toggleAllPageRowsSelected(!!value)}
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
      columnHelper.accessor("label", {
        header: "Label",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-foreground">{row.original.label}</span>
            {row.original.description ? (
              <span className="text-sm text-muted-foreground line-clamp-1">
                {row.original.description}
              </span>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor("key", {
        header: "Key",
        cell: (info) => <code className="text-sm text-muted-foreground">{info.getValue()}</code>,
      }),
      columnHelper.accessor("type", {
        header: "Type",
        cell: (info) => (
          <Badge variant="secondary" className="max-w-[150px] truncate">
            {formatTypeLabel(info.getValue())}
          </Badge>
        ),
      }),
      columnHelper.accessor("stage", {
        header: "Stage",
        cell: (info) => <span className="text-muted-foreground">{formatStageLabel(info.getValue())}</span>,
      }),
      columnHelper.accessor("required", {
        header: "Required",
        cell: (info) => (info.getValue() ? "Required" : "Optional"),
      }),
      columnHelper.accessor("isActive", {
        header: "Status",
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "secondary"}>
            {info.getValue() ? "Active" : "Archived"}
          </Badge>
        ),
      }),
      columnHelper.accessor("updatedAt", {
        header: "Updated",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue().toLocaleDateString()}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSheetState({ open: true, field: row.original })}
            >
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                toggleAction.execute({
                  id: row.original.id,
                  isActive: !row.original.isActive,
                })
              }
              disabled={toggleAction.isPending}
            >
              {row.original.isActive ? "Archive" : "Reactivate"}
            </Button>
          </div>
        ),
      }),
    ],
    [toggleAction],
  );

  return (
    <div className="flex flex-col gap-6">
      <DataTable
        data={fields}
        columns={columns as any}
        searchKey="label"
        searchPlaceholder="Search custom fields..."
        emptyStateTitle="No custom fields yet"
        emptyStateDescription="Start with the member questions your organization needs most."
        toolbarActions={() => (
          <Button onClick={() => setSheetState({ open: true, field: null })}>
            <PlusIcon data-icon="inline-start" className="size-4" />
            New field
          </Button>
        )}
      />

      <MemberCustomFieldSheet
        key={sheetState.field?.id ?? "new"}
        open={sheetState.open}
        field={sheetState.field}
        isPending={saveAction.isPending}
        validationErrors={saveAction.result.validationErrors}
        onOpenChange={(open) => setSheetState((current) => ({ ...current, open }))}
        onSubmit={async (value) => {
          const result = await saveAction.executeAsync(value);

          if (result?.serverError) {
            toast.error(result.serverError);
          }
        }}
      />
    </div>
  );
}
