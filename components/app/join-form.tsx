"use client";

import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import {
  RegistrationGroupInput,
  type RegistrationGroupCategoryInput,
} from "@/components/app/registration-group-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { joinOrganizationAction } from "@/server/actions/member";
import type { MemberCustomField } from "@/server/db/schema";

export function JoinForm({
  termsLabel,
  privacyLabel,
  defaultFirstName,
  defaultLastName,
  customFields,
  registrationGroupCategories,
}: {
  termsLabel: string;
  privacyLabel: string;
  defaultFirstName: string;
  defaultLastName: string;
  customFields: MemberCustomField[];
  registrationGroupCategories: RegistrationGroupCategoryInput[];
}) {
  const router = useRouter();
  const joinAction = useAction(joinOrganizationAction, {
    onSuccess({ data }) {
      if (data?.success) {
        router.push("/portal");
        router.refresh();
      }
    },
  });

  const form = useForm({
    defaultValues: {
      firstName: defaultFirstName,
      lastName: defaultLastName,
      acceptTerms: false,
      acceptPrivacy: false,
      registrationGroupSelections: Object.fromEntries(
        registrationGroupCategories.map((category) => [category.id, null]),
      ),
      customFieldAnswers: Object.fromEntries(customFields.map((field) => [field.key, null])),
    },
    onSubmit: async ({ value }) => {
      await joinAction.executeAsync(value);
    },
  });

  const fieldErrors = joinAction.result.validationErrors;
  const customFieldErrors = joinAction.result.data?.customFieldErrors ?? {};
  const registrationGroupErrors = joinAction.result.data?.registrationGroupErrors ?? {};

  return (
    <form
      className="grid gap-5 rounded-4xl border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          <form.Field name="firstName">
            {(formField) => (
              <Field>
                <FieldLabel htmlFor="join-first-name">First name</FieldLabel>
                <FieldContent>
                  <Input
                    id="join-first-name"
                    name="firstName"
                    autoComplete="given-name"
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
                <FieldLabel htmlFor="join-last-name">Last name</FieldLabel>
                <FieldContent>
                  <Input
                    id="join-last-name"
                    name="lastName"
                    autoComplete="family-name"
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

        {registrationGroupCategories.map((category) => (
          <form.Field
            key={category.id}
            name={`registrationGroupSelections.${category.id}` as never}
          >
            {(formField) => (
              <RegistrationGroupInput
                category={category}
                value={formField.state.value as string | null | undefined}
                error={registrationGroupErrors[category.id]?.[0]}
                onChange={(value) => formField.handleChange(value as never)}
              />
            )}
          </form.Field>
        ))}

        {customFields.map((field) => (
          <form.Field
            key={field.id}
            name={`customFieldAnswers.${field.key}` as never}
          >
            {(formField) => (
              <MemberCustomFieldInput
                field={field}
                value={formField.state.value}
                error={customFieldErrors[field.key]?.[0]}
                onChange={(value) => formField.handleChange(value as never)}
              />
            )}
          </form.Field>
        ))}

        <form.Field name="acceptTerms">
          {(formField) => (
            <Field data-invalid={Boolean(fieldErrors?.acceptTerms?._errors?.[0])}>
              <FieldLabel htmlFor="join-accept-terms">{termsLabel}</FieldLabel>
              <FieldContent>
                <Checkbox
                  id="join-accept-terms"
                  checked={formField.state.value}
                  onCheckedChange={(checked) => formField.handleChange(Boolean(checked))}
                  aria-invalid={Boolean(fieldErrors?.acceptTerms?._errors?.[0])}
                />
                <FieldDescription>
                  Required to create or link your membership record.
                </FieldDescription>
                {fieldErrors?.acceptTerms?._errors?.[0] ? (
                  <FieldError>{fieldErrors.acceptTerms._errors[0]}</FieldError>
                ) : null}
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <form.Field name="acceptPrivacy">
          {(formField) => (
            <Field data-invalid={Boolean(fieldErrors?.acceptPrivacy?._errors?.[0])}>
              <FieldLabel htmlFor="join-accept-privacy">{privacyLabel}</FieldLabel>
              <FieldContent>
                <Checkbox
                  id="join-accept-privacy"
                  checked={formField.state.value}
                  onCheckedChange={(checked) => formField.handleChange(Boolean(checked))}
                  aria-invalid={Boolean(fieldErrors?.acceptPrivacy?._errors?.[0])}
                />
                <FieldDescription>
                  Required before the organization can process your membership.
                </FieldDescription>
                {fieldErrors?.acceptPrivacy?._errors?.[0] ? (
                  <FieldError>{fieldErrors.acceptPrivacy._errors[0]}</FieldError>
                ) : null}
              </FieldContent>
            </Field>
          )}
        </form.Field>
      </FieldGroup>

      {joinAction.result.serverError ? (
        <p
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          aria-live="polite"
        >
          {joinAction.result.serverError}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={joinAction.isPending}>
        {joinAction.isPending ? "Submitting…" : "Join organization"}
      </Button>
    </form>
  );
}
