"use client";

import { useForm } from "@tanstack/react-form";

import {
  groupCategorySchema,
  groupCategorySelectionModeOptions,
  groupJoinPolicyOptions,
  type GroupCategoryFormValues,
} from "@/lib/groups";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type ValidationErrors = Partial<
  Record<keyof GroupCategoryFormValues, { _errors?: string[] }>
>;

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

export function GroupCategorySheet({
  open,
  category,
  isPending,
  validationErrors,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  category?: Partial<GroupCategoryFormValues> | null;
  isPending: boolean;
  validationErrors?: ValidationErrors;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: GroupCategoryFormValues) => Promise<void>;
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {category?.id ? "Edit category" : "Create category"}
          </SheetTitle>
          <SheetDescription>
            Define the top-level wrapper that controls group rules, registration
            hooks, and future delegated-management structure.
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
                      <FieldLabel htmlFor="group-category-name">
                        Name *
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="group-category-name"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) =>
                            formField.handleChange(event.target.value)
                          }
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("name").length > 0)
                          }
                        />
                        <FieldError
                          errors={[
                            ...getClientFieldErrors(
                              formField.state.meta.errors,
                            ).map((message) => ({
                              message,
                            })),
                            ...getFieldError("name").map((message) => ({
                              message,
                            })),
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
                      <FieldLabel htmlFor="group-category-slug">
                        Slug *
                      </FieldLabel>
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
                          Used in URLs and must stay unique inside the
                          organization.
                        </FieldDescription>
                        <FieldError
                          errors={[
                            ...getClientFieldErrors(
                              formField.state.meta.errors,
                            ).map((message) => ({
                              message,
                            })),
                            ...getFieldError("slug").map((message) => ({
                              message,
                            })),
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
                  <Field>
                    <FieldLabel>Selection mode</FieldLabel>
                    <FieldContent>
                      <ToggleGroup
                        type="single"
                        value={formField.state.value}
                        onValueChange={(value) => {
                          if (value) {
                            formField.handleChange(
                              value as GroupCategoryFormValues["selectionMode"],
                            );
                          }
                        }}
                        variant="outline"
                        spacing={0}
                      >
                        {groupCategorySelectionModeOptions.map((option) => (
                          <ToggleGroupItem
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <form.Field name="defaultJoinPolicy">
                {(formField) => (
                  <Field>
                    <FieldLabel>Default join policy</FieldLabel>
                    <FieldContent>
                      <ToggleGroup
                        type="single"
                        value={formField.state.value}
                        onValueChange={(value) => {
                          if (value) {
                            formField.handleChange(
                              value as GroupCategoryFormValues["defaultJoinPolicy"],
                            );
                          }
                        }}
                        orientation="vertical"
                        variant="outline"
                        spacing={1}
                      >
                        {groupJoinPolicyOptions.map((option) => (
                          <ToggleGroupItem
                            key={option.value}
                            value={option.value}
                            className="justify-start"
                          >
                            {option.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </FieldContent>
                  </Field>
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
                          Leave empty to allow any number within the selected
                          mode.
                        </FieldDescription>
                        <FieldError
                          errors={getFieldError("maxSelections").map(
                            (message) => ({ message }),
                          )}
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
                              getFieldError("registrationFieldLabel").length >
                                0)
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
                                  getFieldError("registrationFieldLabel")
                                    .length > 0)
                              }
                            />
                            <FieldDescription>
                              Use the singular label applicants should see, for
                              example &quot;Region&quot; instead of
                              &quot;Regions&quot;.
                            </FieldDescription>
                            <FieldError
                              errors={[
                                ...getClientFieldErrors(
                                  formField.state.meta.errors,
                                ).map((message) => ({
                                  message,
                                })),
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

              <div className="grid gap-5 md:grid-cols-2">
                <form.Field name="selectionRequired">
                  {(formField) => (
                    <Field orientation="horizontal">
                      <Switch
                        checked={formField.state.value}
                        onCheckedChange={formField.handleChange}
                        aria-label="Selection required"
                      />
                      <FieldContent>
                        <FieldLabel>Selection required</FieldLabel>
                        <FieldDescription>
                          Force new members to choose a group in this category
                          later in registration.
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="showInRegistration">
                  {(formField) => (
                    <Field orientation="horizontal">
                      <Switch
                        checked={formField.state.value}
                        onCheckedChange={formField.handleChange}
                        aria-label="Show in registration"
                      />
                      <FieldContent>
                        <FieldLabel>Show in registration</FieldLabel>
                        <FieldDescription>
                          Reserve this category for the public join flow.
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="showInMembersTable">
                  {(formField) => (
                    <Field orientation="horizontal">
                      <Switch
                        checked={formField.state.value}
                        onCheckedChange={formField.handleChange}
                        aria-label="Show in members table"
                      />
                      <FieldContent>
                        <FieldLabel>Show in members table</FieldLabel>
                        <FieldDescription>
                          Add this category as its own column in the members
                          admin table.
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="isPinnedToNavigation">
                  {(formField) => (
                    <Field orientation="horizontal">
                      <Switch
                        checked={formField.state.value}
                        onCheckedChange={formField.handleChange}
                        aria-label="Pin to navigation"
                      />
                      <FieldContent>
                        <FieldLabel>Pin to navigation</FieldLabel>
                        <FieldDescription>
                          Store this now for future specialized management
                          surfaces.
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="isActive">
                  {(formField) => (
                    <Field orientation="horizontal">
                      <Switch
                        checked={formField.state.value}
                        onCheckedChange={formField.handleChange}
                        aria-label="Active category"
                      />
                      <FieldContent>
                        <FieldLabel>Active category</FieldLabel>
                        <FieldDescription>
                          Inactive categories stay visible in admin but stop
                          acting like live structure.
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>
              </div>
            </FieldGroup>
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Saving..."
                : category?.id
                  ? "Save category"
                  : "Create category"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
