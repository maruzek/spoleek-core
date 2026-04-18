"use client";

import { useForm } from "@tanstack/react-form";

import {
  groupCategorySchema,
  groupCategorySelectionModeOptions,
  groupJoinPolicyOptions,
  type GroupCategoryFormValues,
} from "@/lib/groups";
import { slugify } from "@/lib/slugify";
import { SwitchChoiceField } from "@/components/app/switch-choice-field";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

export type GroupCategoryValidationErrors = Partial<
  Record<keyof GroupCategoryFormValues, { _errors?: string[] }>
>;

const selectionModeDescriptions: Record<
  GroupCategoryFormValues["selectionMode"],
  string
> = {
  single: "Each member can belong to only one group in this category.",
  multiple: "Members can belong to several groups in this category at once.",
};

function toDefaultValues(
  category?: Partial<GroupCategoryFormValues> | null,
): GroupCategoryFormValues {
  return {
    id: category?.id,
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    description: category?.description ?? null,
    registrationFieldLabel: category?.registrationFieldLabel ?? null,
    isActive: category?.isActive ?? true,
    isPinnedToNavigation: category?.isPinnedToNavigation ?? false,
    showInRegistration: category?.showInRegistration ?? false,
    showInMembersTable: category?.showInMembersTable ?? false,
    selectionMode: category?.selectionMode ?? "multiple",
    selectionRequired: category?.selectionRequired ?? false,
    maxSelections: category?.maxSelections ?? null,
    defaultJoinPolicy: category?.defaultJoinPolicy ?? "admin_only",
    sortOrder: category?.sortOrder ?? 0,
  };
}

export function GroupCategoryForm({
  category,
  isPending,
  validationErrors,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel = "Cancel",
}: {
  category?: Partial<GroupCategoryFormValues> | null;
  isPending: boolean;
  validationErrors?: GroupCategoryValidationErrors;
  onSubmit: (value: GroupCategoryFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
}) {
  const form = useForm({
    defaultValues: toDefaultValues(category),
    onSubmit: async ({ value }) => {
      const parsed = groupCategorySchema.safeParse(value);

      if (!parsed.success) {
        return;
      }

      await onSubmit(parsed.data);
    },
  });

  const getFieldError = (fieldName: keyof GroupCategoryFormValues): string[] =>
    validationErrors?.[fieldName]?._errors ?? [];
  const getClientFieldErrors = (errors: unknown) =>
    Array.isArray(errors)
      ? errors.filter(
          (message): message is string => typeof message === "string",
        )
      : [];

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <div className="grid gap-5 md:grid-cols-2">
          <form.Field name="name">
            {(formField) => (
              <Field
                data-invalid={
                  (formField.state.meta.isTouched ||
                    form.state.submissionAttempts > 0) &&
                  (formField.state.meta.errors.length > 0 ||
                    getFieldError("name").length > 0)
                }
              >
                <FieldLabel htmlFor="group-category-name">Name *</FieldLabel>
                <FieldContent>
                  <Input
                    id="group-category-name"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => {
                      formField.handleChange(event.target.value);
                      form.setFieldValue(
                        "slug",
                        slugify(event.target.value),
                      );
                    }}
                    aria-invalid={
                      (formField.state.meta.isTouched ||
                        form.state.submissionAttempts > 0) &&
                      (formField.state.meta.errors.length > 0 ||
                        getFieldError("name").length > 0)
                    }
                  />
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map(
                        (message) => ({
                          message,
                        }),
                      ),
                      ...getFieldError("name").map((message) => ({ message })),
                    ]}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="slug">
            {(formField) => (
              <Field
                data-invalid={
                  (formField.state.meta.isTouched ||
                    form.state.submissionAttempts > 0) &&
                  (formField.state.meta.errors.length > 0 ||
                    getFieldError("slug").length > 0)
                }
              >
                <FieldLabel htmlFor="group-category-slug">Slug *</FieldLabel>
                <FieldContent>
                  <Input
                    id="group-category-slug"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) =>
                      formField.handleChange(event.target.value)
                    }
                    aria-invalid={
                      (formField.state.meta.isTouched ||
                        form.state.submissionAttempts > 0) &&
                      (formField.state.meta.errors.length > 0 ||
                        getFieldError("slug").length > 0)
                    }
                  />
                  <FieldDescription>
                    Used in URLs and must stay unique inside the organization.
                  </FieldDescription>
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map(
                        (message) => ({
                          message,
                        }),
                      ),
                      ...getFieldError("slug").map((message) => ({ message })),
                    ]}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </div>

        <form.Field name="description">
          {(formField) => (
            <Field>
              <FieldLabel htmlFor="group-category-description">
                Description
              </FieldLabel>
              <FieldContent>
                <Textarea
                  id="group-category-description"
                  value={formField.state.value ?? ""}
                  onBlur={formField.handleBlur}
                  onChange={(event) =>
                    formField.handleChange(
                      event.target.value.length > 0
                        ? event.target.value
                        : null,
                    )
                  }
                />
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <form.Field name="selectionMode">
          {(formField) => (
            <FieldSet>
              <FieldLegend>Selection mode</FieldLegend>
              <FieldDescription>
                Decide whether members can choose one or several groups from
                this category.
              </FieldDescription>
              <RadioGroup
                value={formField.state.value}
                onValueChange={(value) =>
                  formField.handleChange(
                    value as GroupCategoryFormValues["selectionMode"],
                  )
                }
                className="max-w-2xl"
              >
                {groupCategorySelectionModeOptions.map((option) => {
                  const id = `group-category-selection-mode-${option.value}`;

                  return (
                    <FieldLabel key={option.value} htmlFor={id}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>{option.label}</FieldTitle>
                          <FieldDescription>
                            {selectionModeDescriptions[option.value]}
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value={option.value} id={id} />
                      </Field>
                    </FieldLabel>
                  );
                })}
              </RadioGroup>
            </FieldSet>
          )}
        </form.Field>

        <form.Field name="defaultJoinPolicy">
          {(formField) => (
            <FieldSet>
              <FieldLegend>Default join policy</FieldLegend>
              <FieldDescription>
                Set the default membership behavior for new groups in this
                category.
              </FieldDescription>
              <RadioGroup
                value={formField.state.value}
                onValueChange={(value) =>
                  formField.handleChange(
                    value as GroupCategoryFormValues["defaultJoinPolicy"],
                  )
                }
                className="max-w-2xl"
              >
                {groupJoinPolicyOptions.map((option) => {
                  const id = `group-category-join-policy-${option.value}`;

                  return (
                    <FieldLabel key={option.value} htmlFor={id}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>{option.label}</FieldTitle>
                          <FieldDescription>{option.description}</FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value={option.value} id={id} />
                      </Field>
                    </FieldLabel>
                  );
                })}
              </RadioGroup>
            </FieldSet>
          )}
        </form.Field>

        <div className="grid gap-5 md:grid-cols-2">
          <form.Field name="maxSelections">
            {(formField) => (
              <Field>
                <FieldLabel htmlFor="group-category-max-selections">
                  Max selections
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="group-category-max-selections"
                    type="number"
                    min={1}
                    value={formField.state.value ?? ""}
                    onBlur={formField.handleBlur}
                    onChange={(event) =>
                      formField.handleChange(
                        event.target.value.length > 0
                          ? Number(event.target.value)
                          : null,
                      )
                    }
                  />
                  <FieldDescription>
                    Leave empty to allow any number within the selected mode.
                  </FieldDescription>
                  <FieldError
                    errors={getFieldError("maxSelections").map((message) => ({
                      message,
                    }))}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="sortOrder">
            {(formField) => (
              <Field>
                <FieldLabel htmlFor="group-category-sort-order">
                  Sort order
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="group-category-sort-order"
                    type="number"
                    min={0}
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) =>
                      formField.handleChange(Number(event.target.value))
                    }
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </div>

        <form.Subscribe selector={(state) => state.values.showInRegistration}>
          {(showInRegistration) =>
            showInRegistration ? (
              <form.Field name="registrationFieldLabel">
                {(formField) => (
                  <Field
                    data-invalid={
                      (formField.state.meta.isTouched ||
                        form.state.submissionAttempts > 0) &&
                      (formField.state.meta.errors.length > 0 ||
                        getFieldError("registrationFieldLabel").length > 0)
                    }
                  >
                    <FieldLabel htmlFor="group-category-registration-field-label">
                      Registration field label *
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id="group-category-registration-field-label"
                        value={formField.state.value ?? ""}
                        onBlur={formField.handleBlur}
                        onChange={(event) =>
                          formField.handleChange(
                            event.target.value.length > 0
                              ? event.target.value
                              : null,
                          )
                        }
                        aria-invalid={
                          (formField.state.meta.isTouched ||
                            form.state.submissionAttempts > 0) &&
                          (formField.state.meta.errors.length > 0 ||
                            getFieldError("registrationFieldLabel").length > 0)
                        }
                      />
                      <FieldDescription>
                        Use the singular label applicants should see, for
                        example &quot;Region&quot; instead of &quot;Regions&quot;.
                      </FieldDescription>
                      <FieldError
                        errors={[
                          ...getClientFieldErrors(formField.state.meta.errors).map(
                            (message) => ({
                              message,
                            }),
                          ),
                          ...getFieldError("registrationFieldLabel").map(
                            (message) => ({
                              message,
                            }),
                          ),
                        ]}
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>

        <div className="flex flex-col gap-5">
          <form.Field name="selectionRequired">
            {(formField) => (
              <SwitchChoiceField
                id="group-category-selection-required"
                title="Selection required"
                description="Force new members to choose a group in this category later in registration."
                checked={formField.state.value}
                onCheckedChange={formField.handleChange}
              />
            )}
          </form.Field>

          <form.Field name="showInRegistration">
            {(formField) => (
              <SwitchChoiceField
                id="group-category-show-in-registration"
                title="Show in registration"
                description="Reserve this category for the public join flow."
                checked={formField.state.value}
                onCheckedChange={formField.handleChange}
              />
            )}
          </form.Field>

          <form.Field name="showInMembersTable">
            {(formField) => (
              <SwitchChoiceField
                id="group-category-show-in-members-table"
                title="Show in members table"
                description="Add this category as its own column in the members admin table."
                checked={formField.state.value}
                onCheckedChange={formField.handleChange}
              />
            )}
          </form.Field>

          <form.Field name="isPinnedToNavigation">
            {(formField) => (
              <SwitchChoiceField
                id="group-category-pin-to-navigation"
                title="Pin to navigation"
                description="Store this now for future specialized management surfaces."
                checked={formField.state.value}
                onCheckedChange={formField.handleChange}
              />
            )}
          </form.Field>

          <form.Field name="isActive">
            {(formField) => (
              <SwitchChoiceField
                id="group-category-active"
                title="Active category"
                description="Inactive categories stay visible in admin but stop acting like live structure."
                checked={formField.state.value}
                onCheckedChange={formField.handleChange}
              />
            )}
          </form.Field>
        </div>
      </FieldGroup>

      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving..."
            : submitLabel ?? (category?.id ? "Save category" : "Create category")}
        </Button>
      </div>
    </form>
  );
}
