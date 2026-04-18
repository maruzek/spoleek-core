"use client";

import { useForm } from "@tanstack/react-form";

import {
  groupJoinPolicyOptions,
  groupSchema,
  type GroupFormValues,
} from "@/lib/groups";
import { slugify } from "@/lib/slugify";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldTitle,
} from "@/components/ui/field";
import { SwitchChoiceField } from "@/components/app/switch-choice-field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

export type GroupValidationErrors = Partial<
  Record<keyof GroupFormValues, { _errors?: string[] }>
>;

function toDefaultValues(
  group?: Partial<GroupFormValues> | null,
  categoryId?: string,
): GroupFormValues {
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

export function GroupForm({
  categoryId,
  group,
  isPending,
  validationErrors,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel = "Cancel",
}: {
  categoryId: string;
  group?: Partial<GroupFormValues> | null;
  isPending: boolean;
  validationErrors?: GroupValidationErrors;
  onSubmit: (value: GroupFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
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
                    onChange={(event) => {
                      formField.handleChange(event.target.value);
                      form.setFieldValue("slug", slugify(event.target.value));
                    }}
                    aria-invalid={
                      (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                      (formField.state.meta.errors.length > 0 || getFieldError("name").length > 0)
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
                      (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                      (formField.state.meta.errors.length > 0 || getFieldError("slug").length > 0)
                    }
                  />
                  <FieldDescription>
                    Group URLs are unique across the organization.
                  </FieldDescription>
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
                    formField.handleChange(
                      event.target.value.length > 0 ? event.target.value : null,
                    )
                  }
                />
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <form.Field name="joinPolicy">
          {(formField) => (
            <FieldSet>
              <FieldLegend>Join policy</FieldLegend>
              <FieldDescription>
                Choose how members can enter or leave this group.
              </FieldDescription>
              <RadioGroup
                value={formField.state.value}
                onValueChange={(value) => formField.handleChange(value as GroupFormValues["joinPolicy"])}
                className="max-w-2xl"
              >
                {groupJoinPolicyOptions.map((option) => {
                  const id = `group-join-policy-${option.value}`;

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

        <div className="flex flex-col gap-5">
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
              <SwitchChoiceField
                id="group-active"
                title="Active group"
                description="Archived groups remain visible in admin history but stop acting like live structure."
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
            ? "Saving…"
            : submitLabel ?? (group?.id ? "Save group" : "Create group")}
        </Button>
      </div>
    </form>
  );
}
