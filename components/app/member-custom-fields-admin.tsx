"use client";

import { useMemo, useState } from "react";

import { useForm } from "@tanstack/react-form";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
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

function toFormValues(field: MemberCustomField | null): MemberCustomFieldFormValues {
  return {
    id: field?.id,
    label: field?.label ?? "",
    key: field?.key ?? "",
    description: field?.description ?? "",
    type: field?.type ?? "text",
    stage: field?.stage ?? "optional",
    required: field?.required ?? false,
    isActive: field?.isActive ?? true,
    sortOrder: field?.sortOrder ?? 0,
    options: field?.options ?? [],
  };
}

function formatTypeLabel(type: MemberCustomField["type"]) {
  return memberCustomFieldTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function formatStageLabel(stage: MemberCustomField["stage"]) {
  return memberCustomFieldStageOptions.find((option) => option.value === stage)?.label ?? stage;
}

function getValidationMessages(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => getValidationMessages(entry));
  }

  if (typeof value === "object" && "_errors" in value) {
    const maybeErrors = (value as { _errors?: unknown })._errors;
    return Array.isArray(maybeErrors)
      ? maybeErrors.filter((message): message is string => typeof message === "string")
      : [];
  }

  return [];
}

function getValidationFieldMessages(
  validationErrors: unknown,
  fieldName: keyof MemberCustomFieldFormValues,
) {
  if (!validationErrors || typeof validationErrors !== "object") {
    return [];
  }

  return getValidationMessages(
    (validationErrors as Partial<Record<keyof MemberCustomFieldFormValues, unknown>>)[
      fieldName
    ],
  );
}

export function MemberCustomFieldsAdmin({
  fields,
}: MemberCustomFieldsAdminProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "label", desc: false },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
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

  const data = useMemo(() => fields, [fields]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("label", {
        header: "Label",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-foreground">{row.original.label}</span>
            {row.original.description ? (
              <span className="text-sm text-muted-foreground">
                {row.original.description}
              </span>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor("key", {
        header: "Key",
        cell: (info) => <code className="text-sm">{info.getValue()}</code>,
      }),
      columnHelper.accessor("type", {
        header: "Type",
        cell: (info) => (
          <Badge variant="secondary">{formatTypeLabel(info.getValue())}</Badge>
        ),
      }),
      columnHelper.accessor("stage", {
        header: "Stage",
        cell: (info) => <span>{formatStageLabel(info.getValue())}</span>,
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
        cell: (info) => info.getValue().toLocaleDateString(),
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex gap-2">
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

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue).toLowerCase().trim();
      if (!query) {
        return true;
      }

      return [row.original.label, row.original.key, row.original.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-3xl border bg-card p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold text-foreground">Member custom fields</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Define which member questions appear during registration, after
            approval, and later in the self-service portal.
          </p>
        </div>
        <Button onClick={() => setSheetState({ open: true, field: null })}>
          <PlusIcon data-icon="inline-start" />
          New field
        </Button>
      </div>

      <div className="flex flex-col gap-4 rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="Search custom fields"
              className="pl-10"
            />
          </div>
          <Badge variant="secondary">{fields.length} fields</Badge>
        </div>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 font-medium"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full border bg-muted">
                      <Settings2Icon />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="font-medium text-foreground">
                        No custom fields yet
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Start with the member questions your organization needs most.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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

function MemberCustomFieldSheet({
  open,
  field,
  isPending,
  validationErrors,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  field: MemberCustomField | null;
  isPending: boolean;
  validationErrors: unknown;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: MemberCustomFieldFormValues) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: toFormValues(field),
    onSubmit: async ({ value }) => {
      const parsed = memberCustomFieldSchema.safeParse(value);

      if (!parsed.success) {
        toast.error("Fix the highlighted field settings.");
        return;
      }

      await onSubmit(parsed.data);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {field ? "Edit custom field" : "Create custom field"}
          </SheetTitle>
          <SheetDescription>
            Control where this question appears and how members are expected to answer it.
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <form.Field name="label">
                {(formField) => (
                  <Field
                    data-invalid={
                      (formField.state.meta.isTouched ||
                        form.state.submissionAttempts > 0) &&
                      (formField.state.meta.errors.length > 0 ||
                        getValidationFieldMessages(validationErrors, "label").length > 0)
                    }
                  >
                    <FieldLabel htmlFor="field-label">Label</FieldLabel>
                    <FieldContent>
                      <Input
                        id="field-label"
                        value={formField.state.value}
                        onBlur={formField.handleBlur}
                        onChange={(event) => formField.handleChange(event.target.value)}
                        aria-invalid={
                          (formField.state.meta.isTouched ||
                            form.state.submissionAttempts > 0) &&
                          (formField.state.meta.errors.length > 0 ||
                            getValidationFieldMessages(validationErrors, "label").length > 0)
                        }
                      />
                      <FieldError
                        errors={[
                          ...((formField.state.meta.errors as unknown as string[]) ?? []).map(
                            (message: string) => ({
                            message,
                            }),
                          ),
                          ...getValidationFieldMessages(validationErrors, "label").map(
                            (message: string) => ({
                              message,
                            }),
                          ),
                        ]}
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <form.Field name="key">
                {(formField) => (
                  <Field>
                    <FieldLabel htmlFor="field-key">Key</FieldLabel>
                    <FieldContent>
                      <Input
                        id="field-key"
                        value={formField.state.value}
                        onBlur={formField.handleBlur}
                        onChange={(event) =>
                          formField.handleChange(
                            event.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9_]/g, "_"),
                          )
                        }
                      />
                      <FieldDescription>
                        Stable internal key used when storing answers.
                      </FieldDescription>
                      <FieldError
                        errors={[
                          ...((formField.state.meta.errors as unknown as string[]) ?? []).map(
                            (message: string) => ({
                            message,
                            }),
                          ),
                          ...getValidationFieldMessages(validationErrors, "key").map((message) => ({
                            message,
                          })),
                        ]}
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <form.Field name="description">
                {(formField) => (
                  <Field>
                    <FieldLabel htmlFor="field-description">Description</FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="field-description"
                        value={formField.state.value}
                        onBlur={formField.handleBlur}
                        onChange={(event) => formField.handleChange(event.target.value)}
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <div className="grid gap-5 md:grid-cols-2">
                <form.Field name="type">
                  {(formField) => (
                    <Field>
                      <FieldLabel>Field type</FieldLabel>
                      <FieldContent>
                        <Select
                          value={formField.state.value}
                          onValueChange={(value) =>
                            formField.handleChange(value as MemberCustomField["type"])
                          }
                        >
                          <SelectTrigger className="h-11 w-full rounded-2xl px-4">
                            <SelectValue placeholder="Choose type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {memberCustomFieldTypeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldError
                          errors={getValidationFieldMessages(validationErrors, "type").map(
                            (message: string) => ({
                              message,
                            }),
                          )}
                        />
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="stage">
                  {(formField) => (
                    <Field>
                      <FieldLabel>Visibility stage</FieldLabel>
                      <FieldContent>
                        <Select
                          value={formField.state.value}
                          onValueChange={(value) =>
                            formField.handleChange(value as MemberCustomField["stage"])
                          }
                        >
                          <SelectTrigger className="h-11 w-full rounded-2xl px-4">
                            <SelectValue placeholder="Choose stage" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {memberCustomFieldStageOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <form.Field name="required">
                  {(formField) => (
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="field-required">Required</FieldLabel>
                      <Switch
                        id="field-required"
                        checked={formField.state.value}
                        onCheckedChange={formField.handleChange}
                      />
                    </Field>
                  )}
                </form.Field>

                <form.Field name="isActive">
                  {(formField) => (
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="field-active">Active</FieldLabel>
                      <Switch
                        id="field-active"
                        checked={formField.state.value}
                        onCheckedChange={formField.handleChange}
                      />
                    </Field>
                  )}
                </form.Field>
              </div>

              <form.Field name="sortOrder">
                {(formField) => (
                  <Field>
                    <FieldLabel htmlFor="field-sort-order">Sort order</FieldLabel>
                    <FieldContent>
                      <Input
                        id="field-sort-order"
                        type="number"
                        value={String(formField.state.value)}
                        onBlur={formField.handleBlur}
                        onChange={(event) =>
                          formField.handleChange(Number(event.target.value || "0"))
                        }
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.type}>
                {(type) =>
                  type === "select" || type === "multi_select" ? (
                    <form.Field name="options">
                      {(formField) => (
                        <Field>
                          <FieldLabel htmlFor="field-options">Options</FieldLabel>
                          <FieldContent>
                            <Textarea
                              id="field-options"
                              value={stringifyFieldOptions(formField.state.value)}
                              onBlur={formField.handleBlur}
                              onChange={(event) =>
                                formField.handleChange(
                                  getFieldOptionList(event.target.value),
                                )
                              }
                            />
                            <FieldDescription>
                              Add one option per line.
                            </FieldDescription>
                            <FieldError
                              errors={getValidationFieldMessages(
                                validationErrors,
                                "options",
                              ).map(
                                (message: string) => ({ message }),
                              )}
                            />
                          </FieldContent>
                        </Field>
                      )}
                    </form.Field>
                  ) : null
                }
              </form.Subscribe>
            </FieldGroup>
          </div>

          <SheetFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : field ? "Save changes" : "Create field"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
