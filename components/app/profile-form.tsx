"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import { useAppShell } from "@/components/app/app-shell-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  updateEmailPreferenceAction,
  updateProfileAction,
} from "@/server/actions/member";
import type {
  MemberCustomField,
  MemberPreferredEmail,
} from "@/server/db/schema";

type ProfileFormProps = {
  firstName: string;
  lastName: string;
  customFields: MemberCustomField[];
  customFieldAnswers: Record<string, unknown>;
  showIncompleteBanner: boolean;
  missingRequiredFieldLabels: string[];
  preferredEmail: MemberPreferredEmail | null;
  workspaceEmail: string | null;
  workspaceReady: boolean;
  personalEmail: string | null;
};

export function ProfileForm({
  firstName,
  lastName,
  customFields,
  customFieldAnswers,
  showIncompleteBanner,
  missingRequiredFieldLabels,
  preferredEmail,
  workspaceEmail,
  workspaceReady,
  personalEmail,
}: ProfileFormProps) {
  const router = useRouter();
  const { organization } = useAppShell();

  const profileAction = useAction(updateProfileAction, {
    onSuccess() {
      toast.success("Profile updated successfully.");
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Failed to update profile.");
    },
  });

  const emailPrefAction = useAction(updateEmailPreferenceAction, {
    onSuccess() {
      toast.success("Email preference saved.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Failed to save preference.");
    },
  });

  const fieldErrors = profileAction.result.validationErrors;
  const customFieldErrors = profileAction.result.data?.customFieldErrors ?? {};

  // Show status toast if profile is incomplete
  useEffect(() => {
    if (showIncompleteBanner && missingRequiredFieldLabels.length > 0) {
      toast.error("Complete your profile", {
        description: `Please fill in: ${missingRequiredFieldLabels.join(", ")}`,
        duration: 8000,
      });
    }
  }, [showIncompleteBanner, missingRequiredFieldLabels]);

  // Local state so the radio group re-renders immediately
  const [localPref, setLocalPref] = useState<string>(
    preferredEmail ?? "default",
  );

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

  const requiredMarker = (
    <span className="text-destructive ml-1 font-bold">*</span>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      {/* Main Column - Unified Profile Details */}
      <div className="flex flex-col gap-8 lg:col-span-8">
        <Card>
          <CardHeader>
            <CardTitle>Profile information</CardTitle>
            <CardDescription>
              Your contact details and organization-specific information.
            </CardDescription>
          </CardHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <CardContent>
              <FieldGroup className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {/* Core Name Fields */}
                <form.Field name="firstName">
                  {(formField) => (
                    <Field>
                      <FieldLabel htmlFor="profile-first-name">
                        First name {requiredMarker}
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="profile-first-name"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) =>
                            formField.handleChange(event.target.value)
                          }
                          autoComplete="given-name"
                          aria-invalid={Boolean(
                            fieldErrors?.firstName?._errors?.[0],
                          )}
                        />
                        {fieldErrors?.firstName?._errors?.[0] ? (
                          <FieldError>
                            {fieldErrors.firstName._errors[0]}
                          </FieldError>
                        ) : null}
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="lastName">
                  {(formField) => (
                    <Field>
                      <FieldLabel htmlFor="profile-last-name">
                        Last name {requiredMarker}
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="profile-last-name"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) =>
                            formField.handleChange(event.target.value)
                          }
                          autoComplete="family-name"
                          aria-invalid={Boolean(
                            fieldErrors?.lastName?._errors?.[0],
                          )}
                        />
                        {fieldErrors?.lastName?._errors?.[0] ? (
                          <FieldError>
                            {fieldErrors.lastName._errors[0]}
                          </FieldError>
                        ) : null}
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                {/* Custom Organization Fields */}
                {customFields.length > 0
                  ? customFields.map((field) => (
                      <form.Field
                        key={field.id}
                        name={`customFieldAnswers.${field.key}` as never}
                      >
                        {(formField) => (
                          <div
                            className={
                              field.type === "textarea" ? "sm:col-span-2" : ""
                            }
                          >
                            <MemberCustomFieldInput
                              field={field}
                              value={formField.state.value}
                              error={customFieldErrors[field.key]?.[0]}
                              onChange={(value) =>
                                formField.handleChange(value as never)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    ))
                  : null}
              </FieldGroup>
            </CardContent>

            <CardFooter className="flex justify-end p-6 border-t mt-6 bg-muted/10 translate-y-px">
              <Button
                type="submit"
                disabled={profileAction.isPending}
                className="min-w-32"
              >
                {profileAction.isPending ? "Saving..." : "Save changes"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      {/* Sidebar Column - Email Settings */}
      <div className="flex flex-col gap-8 lg:col-span-4">
        {workspaceReady && workspaceEmail ? (
          <Card>
            <CardHeader>
              <CardTitle>Email settings</CardTitle>
              <CardDescription>
                Where should we reach you?
              </CardDescription>
            </CardHeader>

            <CardContent>
              <RadioGroup
                value={localPref}
                onValueChange={setLocalPref}
                className="grid gap-3"
              >
                <label
                  htmlFor="epref-default"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
                >
                  <RadioGroupItem
                    value="default"
                    id="epref-default"
                    className="mt-1 shrink-0"
                  />
                  <div className="grid gap-1 min-w-0">
                    <Label
                      htmlFor="epref-default"
                      className="cursor-pointer font-semibold leading-tight text-sm"
                    >
                      Default
                    </Label>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {organization.defaultEmailPreference === "workspace"
                        ? workspaceEmail
                        : (personalEmail ?? "—")}
                    </p>
                  </div>
                </label>

                <label
                  htmlFor="epref-personal"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
                >
                  <RadioGroupItem
                    value="personal"
                    id="epref-personal"
                    className="mt-1 shrink-0"
                  />
                  <div className="grid gap-1 min-w-0">
                    <Label
                      htmlFor="epref-personal"
                      className="cursor-pointer font-semibold leading-tight text-sm"
                    >
                      Personal
                    </Label>
                    <p className="font-mono text-[10px] text-muted-foreground truncate">
                      {personalEmail ?? "—"}
                    </p>
                  </div>
                </label>

                <label
                  htmlFor="epref-workspace"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
                >
                  <RadioGroupItem
                    value="workspace"
                    id="epref-workspace"
                    className="mt-1 shrink-0"
                  />
                  <div className="grid gap-1 min-w-0">
                    <Label
                      htmlFor="epref-workspace"
                      className="cursor-pointer font-semibold leading-tight text-sm"
                    >
                      Workspace
                    </Label>
                    <p className="font-mono text-[10px] text-muted-foreground truncate">
                      {workspaceEmail}
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </CardContent>

            <CardFooter className="p-4 border-t mt-4 bg-muted/10">
              <Button
                type="button"
                disabled={emailPrefAction.isPending}
                className="w-full"
                variant="outline"
                onClick={() => {
                  const pref =
                    localPref === "default"
                      ? null
                      : (localPref as MemberPreferredEmail);
                  void emailPrefAction.executeAsync({ preference: pref });
                }}
              >
                {emailPrefAction.isPending ? "Saving..." : "Save preference"}
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <Card className="bg-muted/20 border-dashed">
            <CardHeader>
              <CardTitle className="text-muted-foreground">
                Email settings
              </CardTitle>
              <CardDescription>
                Workspace email is not active.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
