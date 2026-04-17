"use client";

import Link from "next/link";
import { useState } from "react";

import { useForm } from "@tanstack/react-form";
import { useAction } from "next-safe-action/hooks";
import { ArrowRightIcon, CheckCircle2Icon } from "lucide-react";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import {
  RegistrationGroupInput,
  type RegistrationGroupCategoryInput,
} from "@/components/app/registration-group-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { submitJoinApplicationAction } from "@/server/actions/join";
import type { MemberCustomField } from "@/server/db/schema";

type PublicJoinFormProps = {
  customFields: MemberCustomField[];
  registrationGroupCategories: RegistrationGroupCategoryInput[];
  termsLabel: string;
  privacyLabel: string;
};

export function PublicJoinForm({
  customFields,
  registrationGroupCategories,
  termsLabel,
  privacyLabel,
}: PublicJoinFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const submitAction = useAction(submitJoinApplicationAction, {
    onSuccess({ data }) {
      if (data?.success) {
        setSubmitted(true);
      }
    },
  });

  const form = useForm({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      acceptTerms: false,
      acceptPrivacy: false,
      registrationGroupSelections: Object.fromEntries(
        registrationGroupCategories.map((category) => [category.id, null]),
      ),
      customFieldAnswers: Object.fromEntries(customFields.map((field) => [field.key, null])),
    },
    onSubmit: async ({ value }) => {
      await submitAction.executeAsync(value);
    },
  });

  const fieldErrors = submitAction.result.validationErrors;
  const customFieldErrors = submitAction.result.data?.customFieldErrors ?? {};
  const registrationGroupErrors = submitAction.result.data?.registrationGroupErrors ?? {};

  if (submitted) {
    return (
      <Alert className="rounded-3xl border bg-card shadow-sm" aria-live="polite">
        <CheckCircle2Icon aria-hidden="true" />
        <AlertTitle>Application received</AlertTitle>
        <AlertDescription className="leading-7">
          Thank you for applying. We&apos;ve recorded your details and the organization can review
          your request now. If they approve you, they will email you a secure activation link with
          the next login steps.
        </AlertDescription>
      </Alert>
    );
  }

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
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="firstName">
            {(formField) => (
              <Field data-invalid={Boolean(fieldErrors?.firstName?._errors?.[0])}>
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
              <Field data-invalid={Boolean(fieldErrors?.lastName?._errors?.[0])}>
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

        <form.Field name="email">
          {(formField) => (
            <Field data-invalid={Boolean(fieldErrors?.email?._errors?.[0])}>
              <FieldLabel htmlFor="join-email">Email</FieldLabel>
              <FieldContent>
                  <Input
                    id="join-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={formField.state.value}
                  onBlur={formField.handleBlur}
                  onChange={(event) => formField.handleChange(event.target.value)}
                  aria-invalid={Boolean(fieldErrors?.email?._errors?.[0])}
                />
                <FieldDescription>
                  Use the address where you want the organization to contact you.
                </FieldDescription>
                {fieldErrors?.email?._errors?.[0] ? (
                  <FieldError>{fieldErrors.email._errors[0]}</FieldError>
                ) : null}
              </FieldContent>
            </Field>
          )}
        </form.Field>

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
              <FieldContent className="gap-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="join-accept-terms"
                    name="acceptTerms"
                    checked={formField.state.value}
                    onCheckedChange={(checked) => formField.handleChange(Boolean(checked))}
                    aria-invalid={Boolean(fieldErrors?.acceptTerms?._errors?.[0])}
                  />
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="join-accept-terms" className="leading-6">
                      {termsLabel}{" "}
                      <Link href="/legal/terms" className="underline underline-offset-4">
                        Read terms
                      </Link>
                    </FieldLabel>
                    {fieldErrors?.acceptTerms?._errors?.[0] ? (
                      <FieldError>{fieldErrors.acceptTerms._errors[0]}</FieldError>
                    ) : null}
                  </div>
                </div>
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <form.Field name="acceptPrivacy">
          {(formField) => (
            <Field data-invalid={Boolean(fieldErrors?.acceptPrivacy?._errors?.[0])}>
              <FieldContent className="gap-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="join-accept-privacy"
                    name="acceptPrivacy"
                    checked={formField.state.value}
                    onCheckedChange={(checked) => formField.handleChange(Boolean(checked))}
                    aria-invalid={Boolean(fieldErrors?.acceptPrivacy?._errors?.[0])}
                  />
                  <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="join-accept-privacy" className="leading-6">
                      {privacyLabel}{" "}
                      <Link href="/legal/privacy" className="underline underline-offset-4">
                        Read privacy policy
                      </Link>
                    </FieldLabel>
                    {fieldErrors?.acceptPrivacy?._errors?.[0] ? (
                      <FieldError>{fieldErrors.acceptPrivacy._errors[0]}</FieldError>
                    ) : null}
                  </div>
                </div>
              </FieldContent>
            </Field>
          )}
        </form.Field>
      </FieldGroup>

      {submitAction.result.serverError ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertTitle>We couldn&apos;t submit the application</AlertTitle>
          <AlertDescription>{submitAction.result.serverError}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="lg" disabled={submitAction.isPending}>
        {submitAction.isPending ? "Submitting…" : "Submit application"}
        <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
      </Button>
    </form>
  );
}
