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

import { DataTable } from "@/components/ui/data-table";
import { Checkbox } from "@/components/ui/checkbox";

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
