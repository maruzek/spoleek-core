"use client";

import { useForm } from "@tanstack/react-form";
import { useAction } from "next-safe-action/hooks";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
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
import { updateProfileAction } from "@/server/actions/member";
import type { MemberCustomField } from "@/server/db/schema";

type ProfileFormProps = {
  firstName: string;
  lastName: string;
  customFields: MemberCustomField[];
  customFieldAnswers: Record<string, unknown>;
  showIncompleteBanner: boolean;
  missingRequiredFieldLabels: string[];
};

export function ProfileForm({
  firstName,
  lastName,
  customFields,
  customFieldAnswers,
  showIncompleteBanner,
  missingRequiredFieldLabels,
}: ProfileFormProps) {
  const profileAction = useAction(updateProfileAction);
  const fieldErrors = profileAction.result.validationErrors;
  const customFieldErrors = profileAction.result.data?.customFieldErrors ?? {};

  const form = useForm({
    defaultValues: {
      firstName,
      lastName,
      customFieldAnswers,
    },
    onSubmit: async ({ value }) => {
      await profileAction.executeAsync(value);
    },
  });

  return (
    <form
      className="grid gap-5 rounded-4xl border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {showIncompleteBanner && missingRequiredFieldLabels.length > 0 ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Complete these required post-approval fields before using the rest of
          the portal: {missingRequiredFieldLabels.join(", ")}.
        </p>
      ) : null}

      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          <form.Field name="firstName">
            {(formField) => (
              <Field>
                <FieldLabel htmlFor="profile-first-name">First name</FieldLabel>
                <FieldContent>
                  <Input
                    id="profile-first-name"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={Boolean(fieldErrors?.firstName?._errors?.[0])}
                  />
                  {fieldErrors?.firstName?._errors?.[0] ? (
                    <FieldError>{fieldErrors.firstName._errors[0]}</FieldError>
                  ) : null}
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="lastName">
            {(formField) => (
              <Field>
                <FieldLabel htmlFor="profile-last-name">Last name</FieldLabel>
                <FieldContent>
                  <Input
                    id="profile-last-name"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={Boolean(fieldErrors?.lastName?._errors?.[0])}
                  />
                  {fieldErrors?.lastName?._errors?.[0] ? (
                    <FieldError>{fieldErrors.lastName._errors[0]}</FieldError>
                  ) : null}
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </div>

        {customFields.length > 0 ? (
          <Field>
            <FieldLabel>Organization-specific profile fields</FieldLabel>
            <FieldContent>
              <FieldDescription>
                These questions are configured by your organization and stay editable here.
              </FieldDescription>
            </FieldContent>
          </Field>
        ) : null}

        {customFields.map((field) => (
          <MemberCustomFieldInput
            key={field.id}
            field={field}
            value={form.state.values.customFieldAnswers[field.key]}
            error={customFieldErrors[field.key]?.[0]}
            onChange={(value) =>
              form.setFieldValue("customFieldAnswers" as never, {
                ...form.state.values.customFieldAnswers,
                [field.key]: value,
              } as never)
            }
          />
        ))}
      </FieldGroup>

      {profileAction.result.serverError ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {profileAction.result.serverError}
        </p>
      ) : null}
      {profileAction.result.data?.success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Profile updated.
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={profileAction.isPending}>
        {profileAction.isPending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
