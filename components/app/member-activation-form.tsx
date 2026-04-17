"use client";

import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { completeMemberActivationAction } from "@/server/actions/member-activation";
import type { MemberCustomField } from "@/server/db/schema";

type MemberActivationFormProps = {
  memberId: string;
  token: string;
  customFields: MemberCustomField[];
  customFieldAnswers: Record<string, unknown>;
};

export function MemberActivationForm({
  memberId,
  token,
  customFields,
  customFieldAnswers,
}: MemberActivationFormProps) {
  const router = useRouter();
  const activationAction = useAction(completeMemberActivationAction, {
    onSuccess({ data }) {
      if (data?.success) {
        router.push("/portal");
        router.refresh();
      }
    },
  });
  const customFieldErrors =
    activationAction.result.data?.customFieldErrors ?? {};
  const validationErrors = activationAction.result.validationErrors;

  const form = useForm({
    defaultValues: {
      memberId,
      token,
      password: "",
      confirmPassword: "",
      customFieldAnswers,
    },
    onSubmit: async ({ value }) => {
      await activationAction.executeAsync(value);
    },
  });

  return (
    <form
      className="grid gap-6 rounded-[32px] border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="password">
          {(formField) => (
            <Field
              data-invalid={Boolean(validationErrors?.password?._errors?.[0])}
            >
              <FieldLabel htmlFor="activation-password">
                Create password
              </FieldLabel>
              <FieldContent>
                <Input
                  id="activation-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  value={formField.state.value}
                  onBlur={formField.handleBlur}
                  onChange={(event) =>
                    formField.handleChange(event.target.value)
                  }
                  aria-invalid={Boolean(
                    validationErrors?.password?._errors?.[0],
                  )}
                />
                {validationErrors?.password?._errors?.[0] ? (
                  <FieldError>
                    {validationErrors.password._errors[0]}
                  </FieldError>
                ) : null}
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <form.Field name="confirmPassword">
          {(formField) => (
            <Field
              data-invalid={Boolean(
                validationErrors?.confirmPassword?._errors?.[0],
              )}
            >
              <FieldLabel htmlFor="activation-confirm-password">
                Confirm password
              </FieldLabel>
              <FieldContent>
                <Input
                  id="activation-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  value={formField.state.value}
                  onBlur={formField.handleBlur}
                  onChange={(event) =>
                    formField.handleChange(event.target.value)
                  }
                  aria-invalid={Boolean(
                    validationErrors?.confirmPassword?._errors?.[0],
                  )}
                />
                {validationErrors?.confirmPassword?._errors?.[0] ? (
                  <FieldError>
                    {validationErrors.confirmPassword._errors[0]}
                  </FieldError>
                ) : null}
              </FieldContent>
            </Field>
          )}
        </form.Field>

        {customFields.length > 0 ? (
          <Field>
            <FieldLabel>Required profile fields</FieldLabel>
            <FieldContent>
              <FieldDescription>
                Finish the organization-specific questions below before entering
                the portal.
              </FieldDescription>
            </FieldContent>
          </Field>
        ) : null}

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
      </FieldGroup>

      {activationAction.result.serverError ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertTitle>We couldn&apos;t finish the activation</AlertTitle>
          <AlertDescription>
            {activationAction.result.serverError}
          </AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="lg" disabled={activationAction.isPending}>
        {activationAction.isPending
          ? "Finishing setup..."
          : "Finish account setup"}
      </Button>
    </form>
  );
}
