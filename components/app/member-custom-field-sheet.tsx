"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";

import {
  getFieldOptionList,
  memberCustomFieldSchema,
  memberCustomFieldArt9ConditionOptions,
  memberCustomFieldStageOptions,
  memberCustomFieldVisibilityOptions,
  memberCustomFieldDiscoveryModeOptions,
  memberCustomFieldTypeOptions,
  stringifyFieldOptions,
  type MemberCustomFieldFormValues,
} from "@/lib/member-custom-fields";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { MemberCustomFieldConstraintFields } from "@/components/app/member-custom-field-constraint-fields";
import { SwitchChoiceField } from "@/components/app/switch-choice-field";
import { FieldHint } from "@/components/ui/field-hint";
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
import { Textarea } from "@/components/ui/textarea";
import type { MemberCustomField } from "@/server/db/schema";

function toFormValues(
  field: MemberCustomField | null,
): MemberCustomFieldFormValues {
  return {
    id: field?.id,
    label: field?.label ?? "",
    key: field?.key ?? "",
    description: field?.description ?? "",
    type: field?.type ?? "text",
    stage: field?.stage ?? "optional",
    discoveryMode: field?.discoveryMode ?? "available",
    required: field?.required ?? false,
    isActive: field?.isActive ?? true,
    isDateOfBirth: field?.isDateOfBirth ?? false,
    valueVisibility: field?.valueVisibility ?? "member_managers",
    sensitivity: field?.sensitivity ?? "normal",
    art9Condition: field?.art9Condition ?? null,
    processingPurpose: field?.processingPurpose ?? "",
    retentionMonths: field?.retentionMonths ?? null,
    sortOrder: field?.sortOrder ?? 0,
    options: field?.options ?? [],
    constraints: field?.constraints ?? {},
  };
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
      ? maybeErrors.filter(
          (message): message is string => typeof message === "string",
        )
      : [];
  }

  return [];
}

export function getValidationFieldMessages(
  validationErrors: unknown,
  fieldName: keyof MemberCustomFieldFormValues,
) {
  if (!validationErrors || typeof validationErrors !== "object") {
    return [];
  }

  return getValidationMessages(
    (
      validationErrors as Partial<
        Record<keyof MemberCustomFieldFormValues, unknown>
      >
    )[fieldName],
  );
}

export function MemberCustomFieldSheet({
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {field ? "Edit custom field" : "Create custom field"}
          </SheetTitle>
          <SheetDescription>
            Control where this question appears and how members are expected to
            answer it.
          </SheetDescription>
        </SheetHeader>

        <InnerForm
          field={field}
          isPending={isPending}
          validationErrors={validationErrors}
          onSubmit={onSubmit}
        />
      </SheetContent>
    </Sheet>
  );
}

function InnerForm({
  field,
  isPending,
  validationErrors,
  onSubmit,
}: {
  field: MemberCustomField | null;
  isPending: boolean;
  validationErrors: unknown;
  onSubmit: (value: MemberCustomFieldFormValues) => Promise<void>;
}) {
  const [optionsInput, setOptionsInput] = useState(() =>
    stringifyFieldOptions(field?.options ?? []),
  );

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
                        getValidationFieldMessages(validationErrors, "label")
                          .length > 0)
                    }
                  >
                    <FieldLabel htmlFor="field-label">Label</FieldLabel>
                    <FieldContent>
                      <Input
                        id="field-label"
                        value={formField.state.value}
                        onBlur={formField.handleBlur}
                        onChange={(event) =>
                          formField.handleChange(event.target.value)
                        }
                        aria-invalid={
                          (formField.state.meta.isTouched ||
                            form.state.submissionAttempts > 0) &&
                          (formField.state.meta.errors.length > 0 ||
                            getValidationFieldMessages(
                              validationErrors,
                              "label",
                            ).length > 0)
                        }
                      />
                      <FieldError
                        errors={[
                          ...(
                            (formField.state.meta
                              .errors as unknown as string[]) ?? []
                          ).map((message: string) => ({
                            message,
                          })),
                          ...getValidationFieldMessages(
                            validationErrors,
                            "label",
                          ).map((message: string) => ({
                            message,
                          })),
                        ]}
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <form.Field name="key">
                {(formField) => (
                  <Field>
                    <FieldLabel htmlFor="field-key">
                      Key
                      <FieldHint>
                        Stable internal key used when storing answers.
                      </FieldHint>
                    </FieldLabel>
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
                      <FieldError
                        errors={[
                          ...(
                            (formField.state.meta
                              .errors as unknown as string[]) ?? []
                          ).map((message: string) => ({
                            message,
                          })),
                          ...getValidationFieldMessages(
                            validationErrors,
                            "key",
                          ).map((message) => ({
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
                    <FieldLabel htmlFor="field-description">
                      Description
                    </FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="field-description"
                        value={formField.state.value}
                        onBlur={formField.handleBlur}
                        onChange={(event) =>
                          formField.handleChange(event.target.value)
                        }
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
                            formField.handleChange(
                              value as MemberCustomField["type"],
                            )
                          }
                        >
                          <SelectTrigger className="h-11 w-full px-4">
                            <SelectValue placeholder="Choose type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {memberCustomFieldTypeOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldError
                          errors={getValidationFieldMessages(
                            validationErrors,
                            "type",
                          ).map((message: string) => ({
                            message,
                          }))}
                        />
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="stage">
                  {(formField) => (
                    <Field>
                      <FieldLabel>
                        Visibility stage
                        <FieldHint>
                          Admin only fields never appear to members — only
                          admins can fill them in on the member edit form.
                        </FieldHint>
                      </FieldLabel>
                      <FieldContent>
                        <Select
                          value={formField.state.value}
                          onValueChange={(value) =>
                            formField.handleChange(
                              value as MemberCustomField["stage"],
                            )
                          }
                        >
                          <SelectTrigger className="h-11 w-full px-4">
                            <SelectValue placeholder="Choose stage" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {memberCustomFieldStageOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
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

              <form.Field name="discoveryMode">
                {(formField) => (
                  <Field>
                    <FieldLabel>
                      Table discovery
                      <FieldHint>
                        Determines how this field behaves in the main members
                        table.
                      </FieldHint>
                    </FieldLabel>
                    <FieldContent>
                      <Select
                        value={formField.state.value}
                        onValueChange={(value) =>
                          formField.handleChange(
                            value as MemberCustomField["discoveryMode"],
                          )
                        }
                      >
                        <SelectTrigger className="h-11 w-full px-4">
                          <SelectValue placeholder="Choose table discovery mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {memberCustomFieldDiscoveryModeOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
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

              {/*
                Sensitivity sits above visibility on purpose: "may we hold this
                at all" is the prior question to "who may read it", and marking
                a field special-category narrows the visibility default.
              */}
              <form.Field name="sensitivity">
                {(formField) => (
                  <SwitchChoiceField
                    id="field-sensitivity"
                    title="Special-category data"
                    description="Health, ethnicity, religion, political opinion, sex life, biometrics or trade union membership. Article 9 prohibits holding these unless a specific condition applies."
                    checked={formField.state.value === "special_category"}
                    onCheckedChange={(checked) => {
                      formField.handleChange(checked ? "special_category" : "normal");

                      if (checked) {
                        // A safer default the admin can widen deliberately,
                        // rather than one they have to remember to narrow.
                        form.setFieldValue("valueVisibility", "org_admins");
                      } else {
                        form.setFieldValue("art9Condition", null);
                        form.setFieldValue("processingPurpose", "");
                      }
                    }}
                  />
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.sensitivity}>
                {(sensitivity) =>
                  sensitivity === "special_category" ? (
                    <div className="flex flex-col gap-5 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
                      <form.Field name="art9Condition">
                        {(formField) => {
                          const errors = getValidationFieldMessages(
                            validationErrors,
                            "art9Condition",
                          );
                          const selected =
                            memberCustomFieldArt9ConditionOptions.find(
                              (option) => option.value === formField.state.value,
                            );

                          return (
                            <Field data-invalid={errors.length > 0}>
                              <FieldLabel htmlFor="field-art9">
                                Why may the organization hold this?
                              </FieldLabel>
                              <FieldContent>
                                <Select
                                  value={formField.state.value ?? undefined}
                                  onValueChange={(value) =>
                                    formField.handleChange(
                                      value as MemberCustomField["art9Condition"],
                                    )
                                  }
                                >
                                  <SelectTrigger id="field-art9">
                                    <SelectValue placeholder="Choose a condition" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {memberCustomFieldArt9ConditionOptions.map(
                                      (option) => (
                                        <SelectItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                                <FieldDescription>
                                  {selected?.description ??
                                    "Article 9(1) prohibits processing this data. One of these conditions has to lift that prohibition."}
                                </FieldDescription>
                                {errors[0] ? (
                                  <FieldError>{errors[0]}</FieldError>
                                ) : null}
                              </FieldContent>
                            </Field>
                          );
                        }}
                      </form.Field>

                      <form.Field name="processingPurpose">
                        {(formField) => {
                          const errors = getValidationFieldMessages(
                            validationErrors,
                            "processingPurpose",
                          );

                          return (
                            <Field data-invalid={errors.length > 0}>
                              <FieldLabel htmlFor="field-purpose">
                                What is it for?
                              </FieldLabel>
                              <FieldContent>
                                <Textarea
                                  id="field-purpose"
                                  rows={2}
                                  value={formField.state.value ?? ""}
                                  onBlur={formField.handleBlur}
                                  onChange={(event) =>
                                    formField.handleChange(event.target.value)
                                  }
                                  placeholder="Catering and medical safety at events run by the organization."
                                  aria-invalid={errors.length > 0}
                                />
                                <FieldDescription>
                                  Written once, by you, now. This is what the
                                  record of processing says and what a member
                                  asking why you hold it is answered with.
                                </FieldDescription>
                                {errors[0] ? (
                                  <FieldError>{errors[0]}</FieldError>
                                ) : null}
                              </FieldContent>
                            </Field>
                          );
                        }}
                      </form.Field>

                      <form.Field name="retentionMonths">
                        {(formField) => (
                          <Field>
                            <FieldLabel htmlFor="field-retention">
                              Keep answers for (months)
                            </FieldLabel>
                            <FieldContent>
                              <Input
                                id="field-retention"
                                type="number"
                                min={1}
                                max={1200}
                                inputMode="numeric"
                                placeholder="Organization default"
                                value={String(formField.state.value ?? "")}
                                onBlur={formField.handleBlur}
                                onChange={(event) =>
                                  formField.handleChange(
                                    event.target.value === ""
                                      ? null
                                      : Number(event.target.value),
                                  )
                                }
                              />
                              <FieldDescription>
                                Optional. Dietary needs for one summer camp do
                                not need keeping for a decade.
                              </FieldDescription>
                            </FieldContent>
                          </Field>
                        )}
                      </form.Field>
                    </div>
                  ) : null
                }
              </form.Subscribe>

              <form.Field name="valueVisibility">
                {(formField) => (
                  <Field>
                    <FieldLabel htmlFor="field-visibility">
                      Who can see the answers
                    </FieldLabel>
                    <FieldContent>
                      <Select
                        value={formField.state.value}
                        onValueChange={(value) =>
                          formField.handleChange(
                            value as MemberCustomField["valueVisibility"],
                          )
                        }
                      >
                        <SelectTrigger id="field-visibility">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {memberCustomFieldVisibilityOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        {
                          memberCustomFieldVisibilityOptions.find(
                            (option) => option.value === formField.state.value,
                          )?.description
                        }{" "}
                        The member always sees their own answer in the portal and
                        in their data export.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <div className="flex flex-col gap-5">
                <form.Field name="required">
                  {(formField) => (
                    <SwitchChoiceField
                      id="field-required"
                      title="Required"
                      description="Members must provide a value before they can continue through the relevant flow."
                      checked={formField.state.value}
                      onCheckedChange={formField.handleChange}
                    />
                  )}
                </form.Field>

                <form.Field name="isActive">
                  {(formField) => (
                    <SwitchChoiceField
                      id="field-active"
                      title="Active"
                      description="Inactive fields stay in the admin setup but disappear from live member-facing forms."
                      checked={formField.state.value}
                      onCheckedChange={formField.handleChange}
                    />
                  )}
                </form.Field>

                <form.Subscribe selector={(state) => state.values.type}>
                  {(type) =>
                    type === "date" ? (
                      <form.Field name="isDateOfBirth">
                        {(formField) => (
                          <SwitchChoiceField
                            id="field-date-of-birth"
                            title="This is the date of birth"
                            description="Lets the app work out a member's age, so applications below the organization's minimum age are flagged for review instead of approved unnoticed. Only one field can hold this."
                            checked={formField.state.value}
                            onCheckedChange={formField.handleChange}
                          />
                        )}
                      </form.Field>
                    ) : null
                  }
                </form.Subscribe>
              </div>

              <form.Field name="sortOrder">
                {(formField) => (
                  <Field>
                    <FieldLabel htmlFor="field-sort-order">
                      Sort order
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id="field-sort-order"
                        type="number"
                        value={String(formField.state.value)}
                        onBlur={formField.handleBlur}
                        onChange={(event) =>
                          formField.handleChange(
                            Number(event.target.value || "0"),
                          )
                        }
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.type}>
                {(type) => (
                  <form.Field name="constraints">
                    {(formField) => (
                      <MemberCustomFieldConstraintFields
                        type={type}
                        value={formField.state.value}
                        errors={getValidationFieldMessages(
                          validationErrors,
                          "constraints",
                        )}
                        onChange={formField.handleChange}
                      />
                    )}
                  </form.Field>
                )}
              </form.Subscribe>

              <form.Subscribe selector={(state) => state.values.type}>
                {(type) =>
                  type === "select" || type === "multi_select" ? (
                    <form.Field name="options">
                      {(formField) => (
                        <Field>
                          <FieldLabel htmlFor="field-options">
                            Options
                            <FieldHint>Add one option per line.</FieldHint>
                          </FieldLabel>
                          <FieldContent>
                            <Textarea
                              id="field-options"
                              value={optionsInput}
                              onBlur={(event) => {
                                formField.handleBlur();
                                setOptionsInput(
                                  stringifyFieldOptions(
                                    getFieldOptionList(event.target.value),
                                  ),
                                );
                              }}
                              onChange={(event) => {
                                setOptionsInput(event.target.value);
                                formField.handleChange(
                                  getFieldOptionList(event.target.value),
                                );
                              }}
                            />
                            <FieldError
                              errors={getValidationFieldMessages(
                                validationErrors,
                                "options",
                              ).map((message: string) => ({ message }))}
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
          {isPending
            ? "Saving..."
            : field
              ? "Save changes"
              : "Create field"}
        </Button>
      </SheetFooter>
    </form>
  );
}


