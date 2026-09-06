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
import { dictionaryFor, type Dictionary, type Locale } from "@/lib/i18n/messages";
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
  locale: Locale;
  organizationName: string;
  customFields: MemberCustomField[];
  registrationGroupCategories: RegistrationGroupCategoryInput[];
  /** Published documents in force, one checkbox each. */
  policies: JoinPolicy[];
};

/** Split point for the consent sentence; never rendered. */
const TITLE_PLACEHOLDER = "\u0000";

export type JoinPolicy = {
  versionId: string;
  slug: string;
  title: string;
  /** True: an agreement to accept. False: a disclosure to confirm reading. */
  requiresAcceptance: boolean;
};

export function PublicJoinForm({
  locale,
  organizationName,
  customFields,
  registrationGroupCategories,
  policies,
}: PublicJoinFormProps) {
  const dict = dictionaryFor(locale);
  const t = dict.join;
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
      acknowledgedPolicyVersionIds: [] as string[],
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
  // Version ids the server rejected as unacknowledged. The server recomputes the
  // required set, so this is authoritative even if the form rendered otherwise.
  const policyErrors = submitAction.result.data?.policyErrors ?? [];

  if (submitted) {
    return (
      <JoinShellCard>
        <JoinSuccessPanel dict={dict} organizationName={organizationName} />
      </JoinShellCard>
    );
  }

  return (
    <JoinShellCard title={t.formTitle} description={t.formDescription}>
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
                <FieldLabel htmlFor="join-first-name">{t.firstName}</FieldLabel>
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
                <FieldLabel htmlFor="join-last-name">{t.lastName}</FieldLabel>
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
              <FieldLabel htmlFor="join-email">{t.email}</FieldLabel>
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
                <FieldDescription>{t.emailHint}</FieldDescription>
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
                locale={locale}
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
                locale={locale}
                field={field}
                value={formField.state.value}
                error={customFieldErrors[field.key]?.[0]}
                onChange={(value) => formField.handleChange(value as never)}
              />
            )}
          </form.Field>
        ))}

        <form.Field name="acknowledgedPolicyVersionIds">
          {(formField) => {
            const accepted = formField.state.value;
            const missing =
              policyErrors.length > 0 || Boolean(fieldErrors?.acknowledgedPolicyVersionIds);

            return (
              <Field data-invalid={missing}>
                <FieldContent className="gap-3">
                  {policies.map((policy) => {
                    const checked = accepted.includes(policy.versionId);
                    // The sentence is interpolated with a placeholder and split
                    // around it, so the document title itself becomes the link
                    // without hard-coding word order that differs per locale.
                    const [before, after] = (
                      policy.requiresAcceptance
                        ? t.acceptDocument(TITLE_PLACEHOLDER)
                        : t.confirmReadDocument(TITLE_PLACEHOLDER)
                    ).split(TITLE_PLACEHOLDER);

                    return (
                      <div key={policy.versionId} className="flex items-start gap-3">
                        <Checkbox
                          id={`join-policy-${policy.versionId}`}
                          // Nudged down to sit on the first line's centre:
                          // FieldLabel runs at leading-6, the box is 16px.
                          className="mt-1 shrink-0"
                          checked={checked}
                          aria-invalid={missing}
                          onCheckedChange={(value) =>
                            formField.handleChange(
                              value
                                ? [...accepted, policy.versionId]
                                : accepted.filter((id) => id !== policy.versionId),
                            )
                          }
                        />
                        <FieldLabel
                          htmlFor={`join-policy-${policy.versionId}`}
                          // FieldLabel is a flex row, so a bare text + link pair
                          // becomes two flex items and the link floats off to
                          // the side once the text wraps. One inline child keeps
                          // it a single sentence.
                          className="block leading-6 font-normal"
                        >
                          {before}
                          <Link
                            href={`/legal/${policy.slug}`}
                            target="_blank"
                            className="underline underline-offset-4"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {policy.title}
                          </Link>
                          {after}
                        </FieldLabel>
                      </div>
                    );
                  })}
                  {missing ? (
                    <FieldError>{dict.errors.acceptDocument}</FieldError>
                  ) : null}
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>

      {submitAction.result.serverError ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertTitle>{t.serverErrorTitle}</AlertTitle>
          <AlertDescription>{submitAction.result.serverError}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="lg" disabled={submitAction.isPending}>
        {submitAction.isPending ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : null}
        {submitAction.isPending ? t.submitting : t.submit}
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

function JoinSuccessPanel({
  dict,
  organizationName,
}: {
  dict: Dictionary;
  organizationName: string;
}) {
  const t = dict.join;
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
          {t.successTitle}
        </h2>
        <p className="max-w-sm text-sm leading-7 text-balance text-muted-foreground">
          {t.successBody(organizationName)}
        </p>
      </div>

      <ol className="flex w-full max-w-sm flex-col gap-4 text-left">
        {t.successSteps.map((step, index) => (
          <li key={step} className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-public-hairline text-xs font-medium text-muted-foreground">
              {index + 1}
            </span>
            <span className="text-sm leading-6 text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>

      <Button asChild variant="outline">
        <Link href="/login">{dict.common.backToSignIn}</Link>
      </Button>
    </div>
  );
}
