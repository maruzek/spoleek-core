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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveJoinPageSettingsAction } from "@/server/actions/organization-settings";
import type { Organization, OrganizationPolicy } from "@/server/db/schema";

type JoinPageSettingsFormProps = {
  organization: Pick<
    Organization,
    | "joinPageHeadline"
    | "joinPageBody"
    | "registrationMinimumAge"
    | "membershipEndsAtAge"
    | "maximumAgeEffect"
  >;
  policy: Pick<
    OrganizationPolicy,
    "memberInviteEmailSubject" | "memberInviteEmailBody"
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
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
      registrationMinimumAge: organization.registrationMinimumAge ?? "",
      membershipEndsAtAge: organization.membershipEndsAtAge ?? "",
      maximumAgeEffect: organization.maximumAgeEffect,
      joinPageBody: organization.joinPageBody,
      memberInviteEmailSubject: policy.memberInviteEmailSubject,
      memberInviteEmailBody: policy.memberInviteEmailBody,
    },
    onSubmit: async ({ value }) => {
      await saveAction.executeAsync(value);
    },
  });

  const validationErrors = saveAction.result.validationErrors;

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-4">
        <SectionHeading>Public page</SectionHeading>
        <FieldGroup>
          <form.Field name="joinPageHeadline">
            {(formField) => {
              const errors = [
                ...getFormFieldErrors(formField.state.meta.errors),
                ...getErrorMessages(validationErrors?.joinPageHeadline),
              ];

              return (
                <Field data-invalid={errors.length > 0}>
                  <FieldLabel htmlFor="join-page-headline">Headline</FieldLabel>
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
                      The first line applicants see on the public <code>/join</code> page.
                    </FieldDescription>
                    {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="registrationMinimumAge">
            {(formField) => {
              const errors = [
                ...getFormFieldErrors(formField.state.meta.errors),
                ...getErrorMessages(validationErrors?.registrationMinimumAge),
              ];

              return (
                <Field data-invalid={errors.length > 0}>
                  <FieldLabel htmlFor="registration-minimum-age">
                    Minimum age
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="registration-minimum-age"
                      name="registrationMinimumAge"
                      type="number"
                      min={0}
                      max={150}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="No minimum"
                      value={String(formField.state.value ?? "")}
                      onBlur={formField.handleBlur}
                      onChange={(event) => formField.handleChange(event.target.value)}
                      aria-invalid={errors.length > 0}
                    />
                    <FieldDescription>
                      Applications below this age are flagged for review and cannot be
                      approved without an explicit confirmation — they are never
                      rejected automatically. Needs a date field marked as the date of
                      birth in Custom fields. Leave empty for no minimum.
                    </FieldDescription>
                    {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="membershipEndsAtAge">
            {(formField) => {
              const errors = [
                ...getFormFieldErrors(formField.state.meta.errors),
                ...getErrorMessages(validationErrors?.membershipEndsAtAge),
              ];

              return (
                <Field data-invalid={errors.length > 0}>
                  <FieldLabel htmlFor="membership-ends-at-age">
                    Membership ends at age
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="membership-ends-at-age"
                      name="membershipEndsAtAge"
                      type="number"
                      min={0}
                      max={150}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="No age limit"
                      value={String(formField.state.value ?? "")}
                      onBlur={formField.handleBlur}
                      onChange={(event) => formField.handleChange(event.target.value)}
                      aria-invalid={errors.length > 0}
                    />
                    <FieldDescription>
                      The age at which membership ends, not the last age a member
                      may be — &ldquo;membership ends on the 36th birthday&rdquo;
                      is <strong>36</strong>. Members past it stop being billed
                      and are flagged for the board to review; nothing is
                      deleted. Leave empty for no age limit.
                    </FieldDescription>
                    {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          <form.Subscribe
            selector={(state) => state.values.membershipEndsAtAge}
          >
            {(endsAtAge) =>
              endsAtAge === "" || endsAtAge == null ? null : (
                <form.Field name="maximumAgeEffect">
                  {(formField) => (
                    <Field>
                      <FieldLabel htmlFor="maximum-age-effect">
                        Membership ends
                      </FieldLabel>
                      <FieldContent>
                        <Select
                          value={formField.state.value}
                          onValueChange={(value) =>
                            formField.handleChange(
                              value as "period_end" | "birthday",
                            )
                          }
                        >
                          <SelectTrigger id="maximum-age-effect">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="period_end">
                              At the end of the period in which they reach it
                            </SelectItem>
                            <SelectItem value="birthday">
                              On that birthday
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          Many statutes end membership at the end of the year in
                          which the member reaches the age, because expiring
                          somebody mid-season is rarely what is meant. Choose the
                          birthday only if the statutes say so literally.
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>
              )
            }
          </form.Subscribe>

          <form.Field name="joinPageBody">
            {(formField) => {
              const errors = [
                ...getFormFieldErrors(formField.state.meta.errors),
                ...getErrorMessages(validationErrors?.joinPageBody),
              ];

              return (
                <Field data-invalid={errors.length > 0}>
                  <FieldLabel htmlFor="join-page-body">Body copy</FieldLabel>
                  <FieldContent>
                    <Textarea
                      id="join-page-body"
                      name="joinPageBody"
                      autoComplete="off"
                      value={formField.state.value}
                      onBlur={formField.handleBlur}
                      onChange={(event) => formField.handleChange(event.target.value)}
                      aria-invalid={errors.length > 0}
                      rows={4}
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
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeading>Invite email</SectionHeading>
        <FieldGroup>
          <form.Field name="memberInviteEmailSubject">
            {(formField) => {
              const errors = [
                ...getFormFieldErrors(formField.state.meta.errors),
                ...getErrorMessages(validationErrors?.memberInviteEmailSubject),
              ];

              return (
                <Field data-invalid={errors.length > 0}>
                  <FieldLabel htmlFor="member-invite-email-subject">Subject</FieldLabel>
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
                      Sent when an approved member is invited to activate their account.
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
                  <FieldLabel htmlFor="member-invite-email-body">Body</FieldLabel>
                  <FieldContent>
                    <Textarea
                      id="member-invite-email-body"
                      name="memberInviteEmailBody"
                      autoComplete="off"
                      value={formField.state.value}
                      onBlur={formField.handleBlur}
                      onChange={(event) => formField.handleChange(event.target.value)}
                      aria-invalid={errors.length > 0}
                      rows={4}
                    />
                    <FieldDescription>
                      Spoleek adds the activation button and expiration note automatically.
                    </FieldDescription>
                    {errors[0] ? <FieldError>{errors[0]}</FieldError> : null}
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>
        </FieldGroup>
      </div>

      {/*
        The legal documents used to be four plain textareas here. They now live
        in the Legal tab, where they are versioned and every published version
        stays readable — see docs/legal-policies.md.
      */}

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
