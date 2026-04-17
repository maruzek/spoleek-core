"use client";

import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { saveJoinPageSettingsAction } from "@/server/actions/organization-settings";
import type { Organization, OrganizationPolicy } from "@/server/db/schema";

type JoinPageSettingsFormProps = {
  organization: Pick<Organization, "joinPageHeadline" | "joinPageBody">;
  policy: Pick<
    OrganizationPolicy,
    | "memberInviteEmailSubject"
    | "memberInviteEmailBody"
    | "termsOfServiceLabel"
    | "termsOfServiceText"
    | "privacyPolicyLabel"
    | "privacyPolicyText"
  >;
};

function getErrorMessages(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("_errors" in value)) {
    return [];
  }

  const maybeErrors = (value as { _errors?: unknown })._errors;
  return Array.isArray(maybeErrors)
    ? maybeErrors.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function getFormFieldErrors(errors: unknown[]): string[] {
  return errors
    .map((error) => (typeof error === "string" ? error : null))
    .filter((error): error is string => Boolean(error));
}

export function JoinPageSettingsForm({
  organization,
  policy,
}: JoinPageSettingsFormProps) {
  const router = useRouter();
  const saveAction = useAction(saveJoinPageSettingsAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Join page settings updated.");
        router.refresh();
      }
    },
  });

  const form = useForm({
    defaultValues: {
      joinPageHeadline: organization.joinPageHeadline,
      joinPageBody: organization.joinPageBody,
      memberInviteEmailSubject: policy.memberInviteEmailSubject,
      memberInviteEmailBody: policy.memberInviteEmailBody,
      termsOfServiceLabel: policy.termsOfServiceLabel,
      termsOfServiceText: policy.termsOfServiceText,
      privacyPolicyLabel: policy.privacyPolicyLabel,
      privacyPolicyText: policy.privacyPolicyText,
    },
    onSubmit: async ({ value }) => {
      await saveAction.executeAsync(value);
    },
  });

  const validationErrors = saveAction.result.validationErrors;

  return (
    <form
      className="flex flex-col gap-6 rounded-3xl border bg-card p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="joinPageHeadline">
          {(formField) => {
            const errors = [
              ...getFormFieldErrors(formField.state.meta.errors),
              ...getErrorMessages(validationErrors?.joinPageHeadline),
            ];

            return (
              <Field data-invalid={errors.length > 0}>
                <FieldLabel htmlFor="join-page-headline">Public headline</FieldLabel>
                <FieldContent>
                  <Input
                    id="join-page-headline"
                    name="joinPageHeadline"
                    autoComplete="off"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={errors.length > 0}
                  />
                  <FieldDescription>
                    This is the first line applicants see on the public `/join` page.
                  </FieldDescription>
                  {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="joinPageBody">
          {(formField) => {
            const errors = [
              ...getFormFieldErrors(formField.state.meta.errors),
              ...getErrorMessages(validationErrors?.joinPageBody),
            ];

            return (
              <Field data-invalid={errors.length > 0}>
                <FieldLabel htmlFor="join-page-body">Public body copy</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="join-page-body"
                    name="joinPageBody"
                    autoComplete="off"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={errors.length > 0}
                    rows={5}
                  />
                  <FieldDescription>
                    Keep this short and welcoming. Plain text only.
                  </FieldDescription>
                  {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>

      <Separator />

      <FieldGroup>
        <form.Field name="memberInviteEmailSubject">
          {(formField) => {
            const errors = [
              ...getFormFieldErrors(formField.state.meta.errors),
              ...getErrorMessages(validationErrors?.memberInviteEmailSubject),
            ];

            return (
              <Field data-invalid={errors.length > 0}>
                <FieldLabel htmlFor="member-invite-email-subject">Invite email subject</FieldLabel>
                <FieldContent>
                  <Input
                    id="member-invite-email-subject"
                    name="memberInviteEmailSubject"
                    autoComplete="off"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={errors.length > 0}
                  />
                  <FieldDescription>
                    This subject line is sent when an approved member is invited to activate their
                    account.
                  </FieldDescription>
                  {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="memberInviteEmailBody">
          {(formField) => {
            const errors = [
              ...getFormFieldErrors(formField.state.meta.errors),
              ...getErrorMessages(validationErrors?.memberInviteEmailBody),
            ];

            return (
              <Field data-invalid={errors.length > 0}>
                <FieldLabel htmlFor="member-invite-email-body">Invite email body</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="member-invite-email-body"
                    name="memberInviteEmailBody"
                    autoComplete="off"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={errors.length > 0}
                    rows={5}
                  />
                  <FieldDescription>
                    Keep the template instructions clear. Spoleek adds the activation button and
                    expiration note automatically.
                  </FieldDescription>
                  {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="termsOfServiceLabel">
          {(formField) => {
            const errors = [
              ...getFormFieldErrors(formField.state.meta.errors),
              ...getErrorMessages(validationErrors?.termsOfServiceLabel),
            ];

            return (
              <Field data-invalid={errors.length > 0}>
                <FieldLabel htmlFor="terms-label">Terms checkbox label</FieldLabel>
                <FieldContent>
                  <Input
                    id="terms-label"
                    name="termsOfServiceLabel"
                    autoComplete="off"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={errors.length > 0}
                  />
                  {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="termsOfServiceText">
          {(formField) => {
            const errors = [
              ...getFormFieldErrors(formField.state.meta.errors),
              ...getErrorMessages(validationErrors?.termsOfServiceText),
            ];

            return (
              <Field data-invalid={errors.length > 0}>
                <FieldLabel htmlFor="terms-text">Terms page content</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="terms-text"
                    name="termsOfServiceText"
                    autoComplete="off"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={errors.length > 0}
                    rows={8}
                  />
                  {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="privacyPolicyLabel">
          {(formField) => {
            const errors = [
              ...getFormFieldErrors(formField.state.meta.errors),
              ...getErrorMessages(validationErrors?.privacyPolicyLabel),
            ];

            return (
              <Field data-invalid={errors.length > 0}>
                <FieldLabel htmlFor="privacy-label">Privacy checkbox label</FieldLabel>
                <FieldContent>
                  <Input
                    id="privacy-label"
                    name="privacyPolicyLabel"
                    autoComplete="off"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={errors.length > 0}
                  />
                  {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="privacyPolicyText">
          {(formField) => {
            const errors = [
              ...getFormFieldErrors(formField.state.meta.errors),
              ...getErrorMessages(validationErrors?.privacyPolicyText),
            ];

            return (
              <Field data-invalid={errors.length > 0}>
                <FieldLabel htmlFor="privacy-text">Privacy page content</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="privacy-text"
                    name="privacyPolicyText"
                    autoComplete="off"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={errors.length > 0}
                    rows={8}
                  />
                  {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>

      {saveAction.result.serverError ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertTitle>Unable to save settings</AlertTitle>
          <AlertDescription>{saveAction.result.serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div>
        <Button type="submit" disabled={saveAction.isPending}>
          {saveAction.isPending ? "Saving..." : "Save join page settings"}
        </Button>
      </div>
    </form>
  );
}
