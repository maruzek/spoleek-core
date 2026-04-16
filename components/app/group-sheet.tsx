"use client";

import { useForm } from "@tanstack/react-form";

import {
  groupJoinPolicyOptions,
  groupSchema,
  type GroupFormValues,
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

type ValidationErrors = Partial<Record<keyof GroupFormValues, { _errors?: string[] }>>;

function toDefaultValues(group?: Partial<GroupFormValues> | null, categoryId?: string): GroupFormValues {
  return {
    id: group?.id,
    categoryId: group?.categoryId ?? categoryId ?? "",
    name: group?.name ?? "",
    slug: group?.slug ?? "",
    description: group?.description ?? null,
    joinPolicy: group?.joinPolicy ?? "admin_only",
    isActive: group?.isActive ?? true,
    sortOrder: group?.sortOrder ?? 0,
  };
}

export function GroupSheet({
  open,
  categoryId,
  group,
  isPending,
  validationErrors,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  categoryId: string;
  group?: Partial<GroupFormValues> | null;
  isPending: boolean;
  validationErrors?: ValidationErrors;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: GroupFormValues) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: toDefaultValues(group, categoryId),
    onSubmit: async ({ value }) => {
      const parsed = groupSchema.safeParse(value);

      if (!parsed.success) {
        return;
      }

      await onSubmit(parsed.data);
    },
  });

  const getFieldError = (fieldName: keyof GroupFormValues): string[] =>
    validationErrors?.[fieldName]?._errors ?? [];
  const getClientFieldErrors = (errors: unknown) =>
    Array.isArray(errors)
      ? errors.filter((message): message is string => typeof message === "string")
      : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{group?.id ? "Edit group" : "Create group"}</SheetTitle>
          <SheetDescription>
            Configure the active unit inside this category, including its join policy and
            operational status.
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
                        (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                        (formField.state.meta.errors.length > 0 || getFieldError("name").length > 0)
                      }
                    >
                      <FieldLabel htmlFor="group-name">Name *</FieldLabel>
                      <FieldContent>
                        <Input
                          id="group-name"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) => formField.handleChange(event.target.value)}
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("name").length > 0)
                          }
                        />
                        <FieldError
                          errors={[
                            ...getClientFieldErrors(formField.state.meta.errors).map((message) => ({
                              message,
                            })),
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
                        (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                        (formField.state.meta.errors.length > 0 || getFieldError("slug").length > 0)
                      }
                    >
                      <FieldLabel htmlFor="group-slug">Slug *</FieldLabel>
                      <FieldContent>
                        <Input
                          id="group-slug"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) => formField.handleChange(event.target.value)}
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("slug").length > 0)
                          }
                        />
                        <FieldDescription>Group URLs are unique across the organization.</FieldDescription>
                        <FieldError
                          errors={[
                            ...getClientFieldErrors(formField.state.meta.errors).map((message) => ({
                              message,
                            })),
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
                    <FieldLabel htmlFor="group-description">Description</FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="group-description"
                        value={formField.state.value ?? ""}
                        onBlur={formField.handleBlur}
                        onChange={(event) =>
                          formField.handleChange(event.target.value.length > 0 ? event.target.value : null)
                        }
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <form.Field name="joinPolicy">
                {(formField) => (
                  <Field>
                    <FieldLabel>Join policy</FieldLabel>
                    <FieldContent>
                      <ToggleGroup
                        type="single"
                        orientation="vertical"
                        value={formField.state.value}
                        onValueChange={(value) => {
                          if (value) {
                            formField.handleChange(value as GroupFormValues["joinPolicy"]);
                          }
                        }}
                        variant="outline"
                        spacing={1}
                      >
                        {groupJoinPolicyOptions.map((option) => (
                          <ToggleGroupItem key={option.value} value={option.value} className="justify-start">
                            {option.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <div className="grid gap-5 md:grid-cols-2">
                <form.Field name="sortOrder">
                  {(formField) => (
                    <Field>
                      <FieldLabel htmlFor="group-sort-order">Sort order</FieldLabel>
                      <FieldContent>
                        <Input
                          id="group-sort-order"
                          type="number"
                          min={0}
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) => formField.handleChange(Number(event.target.value))}
                        />
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
                        aria-label="Active group"
                      />
                      <FieldContent>
                        <FieldLabel>Active group</FieldLabel>
                        <FieldDescription>
                          Archived groups remain visible in admin history but stop acting like live structure.
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>
              </div>
            </FieldGroup>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : group?.id ? "Save group" : "Create group"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
