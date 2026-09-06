"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useForm } from "@tanstack/react-form";
import { useAction } from "next-safe-action/hooks";
import { ArrowRightIcon, CheckIcon, Loader2Icon } from "lucide-react";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import {
  RegistrationGroupInput,
  type RegistrationGroupCategoryInput,
} from "@/components/app/registration-group-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  organizationName: string;
  customFields: MemberCustomField[];
  registrationGroupCategories: RegistrationGroupCategoryInput[];
  termsLabel: string;
  privacyLabel: string;
};

export function PublicJoinForm({
  organizationName,
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
      <JoinShellCard>
        <JoinSuccessPanel organizationName={organizationName} />
      </JoinShellCard>
    );
  }

  return (
    <JoinShellCard
      title="Apply to join"
      description="Fill in your contact details, answer the organization's questions, and submit your application for review."
    >
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
        {submitAction.isPending ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : null}
        {submitAction.isPending ? "Submitting…" : "Submit application"}
        {submitAction.isPending ? null : (
          <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
        )}
      </Button>
    </form>
    </JoinShellCard>
  );
}

function JoinShellCard({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="public-card min-h-[32rem] justify-center shadow-[0_24px_60px_-28px_rgba(16,24,40,0.3)]">
      {title ? (
        <CardHeader className="gap-3">
          <CardTitle className="text-2xl">{title}</CardTitle>
          {description ? (
            <CardDescription className="text-sm leading-6">{description}</CardDescription>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const NEXT_STEPS = [
  "An administrator reviews your application.",
  "If they approve it, you get an email at the address you gave us.",
  "That email carries a secure activation link that sets up your login.",
];

function JoinSuccessPanel({ organizationName }: { organizationName: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The form is gone from the DOM, so move focus somewhere meaningful rather
  // than letting it fall back to <body>.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      className="flex flex-col items-center gap-6 py-6 text-center"
      role="status"
      aria-live="polite"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/12 text-primary">
        <CheckIcon className="size-7" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-3">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-semibold outline-none"
        >
          Application received
        </h2>
        <p className="max-w-sm text-sm leading-7 text-balance text-muted-foreground">
          Thank you for applying to {organizationName}. Your details are recorded and there is
          nothing else to send.
        </p>
      </div>

      <ol className="flex w-full max-w-sm flex-col gap-4 text-left">
        {NEXT_STEPS.map((step, index) => (
          <li key={step} className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-public-hairline text-xs font-medium text-muted-foreground">
              {index + 1}
            </span>
            <span className="text-sm leading-6 text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>

      <Button asChild variant="outline">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}
