"use client";

import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import { MemberGroupAssignmentField } from "@/components/app/member-group-assignment-field";
import type { MemberCustomField } from "@/server/db/schema";
import {
  createMemberSchema,
  type CreateMemberValues,
} from "@/lib/member-admin";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { TenantRole } from "@/server/db/schema";
import type { MemberManagementGroupCategory } from "@/server/lib/member-management-scope";

export type ShadowMemberFormValues = CreateMemberValues;

type ValidationFieldError =
  | { _errors?: string[] }
  | Array<{ _errors?: string[] }>
  | undefined;
type MemberSheetValidationErrors = Partial<
  Record<keyof ShadowMemberFormValues, Exclude<ValidationFieldError, undefined>>
>;

export function MemberSheet({
  open,
  isPending,
  accessLevel,
  roleOptions,
  manageableGroupCategories,
  customFields,
  customFieldErrors,
  workspaceReady,
  serverError,
  validationErrors,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  isPending: boolean;
  accessLevel: "full" | "scoped";
  roleOptions: TenantRole[];
  manageableGroupCategories: MemberManagementGroupCategory[];
  customFields: MemberCustomField[];
  customFieldErrors?: Record<string, string[]>;
  /** Workspace module is enabled, connected, and has a domain. */
  workspaceReady?: boolean;
  serverError?: string;
  validationErrors?: MemberSheetValidationErrors;
  onOpenChange: (open: boolean) => void;
  /** Resolves to `true` when the member was actually created. */
  onSubmit: (
    value: ShadowMemberFormValues,
    options: { createWorkspaceAccount: boolean },
  ) => Promise<boolean>;
}) {
  /**
   * Only fields the org still collects. Inactive ones stay editable on the
   * member's own page, but offering them at creation time would ask admins to
   * fill in something the org has retired.
   *
   * "Required" is kept only for registration-stage fields — the same ones the
   * join form insists on. An admin creating a record up front cannot be
   * expected to know an answer the member only gives after approval, and the
   * server enforces the identical rule.
   */
  const activeCustomFields = useMemo(
    () =>
      customFields
        .filter((field) => field.isActive)
        .map((field) =>
          field.stage === "registration"
            ? field
            : { ...field, required: false },
        ),
    [customFields],
  );

  const defaultValues: ShadowMemberFormValues = {
    firstName: "",
    lastName: "",
    email: "",
    role: "member",
    status: "active",
    groupIds: [],
    customFieldAnswers: Object.fromEntries(
      activeCustomFields.map((field) => [field.key, null]),
    ),
  };

  /**
   * Opt-in only. The account itself is set up in the provisioning dialog after
   * the member exists — that dialog can only auto-fill Google's fields from a
   * saved member record, so asking for the address here would be guesswork.
   */
  const [createAccount, setCreateAccount] = useState(false);

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const parsed = createMemberSchema.safeParse(value);

      if (!parsed.success) {
        return;
      }

      const created = await onSubmit(parsed.data, {
        createWorkspaceAccount: createAccount && Boolean(workspaceReady),
      });

      // Resetting on failure wiped everything the admin had typed and left the
      // server's field errors pointing at empty inputs.
      if (!created) {
        return;
      }

      form.reset();
      setCreateAccount(false);
    },
  });

  const getFieldError = (fieldName: keyof ShadowMemberFormValues): string[] => {
    const error = validationErrors?.[fieldName] as ValidationFieldError;

    if (Array.isArray(error)) {
      return error.flatMap((item) => item?._errors ?? []);
    }

    return error?._errors ?? [];
  };
  const getClientFieldErrors = (errors: unknown) =>
    Array.isArray(errors)
      ? errors.filter(
          (message): message is string => typeof message === "string",
        )
      : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Create member or shadow profile</SheetTitle>
          <SheetDescription>
            {accessLevel === "full"
              ? "Add a member record directly and optionally link it to an existing account when the email already belongs to a signed-in user."
              : "Add a member directly into the groups you administer so the record stays inside your scope."}
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <div className="grid gap-5 md:grid-cols-2">
                <form.Field name="firstName">
                  {(formField) => (
                    <Field
                      data-invalid={
                        (formField.state.meta.isTouched ||
                          form.state.submissionAttempts > 0) &&
                        (formField.state.meta.errors.length > 0 ||
                          getFieldError("firstName").length > 0)
                      }
                    >
                      <FieldLabel htmlFor="field-first-name">
                        First name *
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="field-first-name"
                          autoComplete="given-name"
                          placeholder="Anna"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) =>
                            formField.handleChange(event.target.value)
                          }
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("firstName").length > 0)
                          }
                        />
                        <FieldError
                          errors={[
                            ...getClientFieldErrors(
                              formField.state.meta.errors,
                            ).map((message) => ({ message })),
                            ...getFieldError("firstName").map((message) => ({
                              message,
                            })),
                          ]}
                        />
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="lastName">
                  {(formField) => (
                    <Field
                      data-invalid={
                        (formField.state.meta.isTouched ||
                          form.state.submissionAttempts > 0) &&
                        (formField.state.meta.errors.length > 0 ||
                          getFieldError("lastName").length > 0)
                      }
                    >
                      <FieldLabel htmlFor="field-last-name">
                        Last name *
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="field-last-name"
                          autoComplete="family-name"
                          placeholder="Novak"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) =>
                            formField.handleChange(event.target.value)
                          }
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("lastName").length > 0)
                          }
                        />
                        <FieldError
                          errors={[
                            ...getClientFieldErrors(
                              formField.state.meta.errors,
                            ).map((message) => ({ message })),
                            ...getFieldError("lastName").map((message) => ({
                              message,
                            })),
                          ]}
                        />
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="email">
                  {(formField) => (
                    <Field
                      data-invalid={
                        (formField.state.meta.isTouched ||
                          form.state.submissionAttempts > 0) &&
                        (formField.state.meta.errors.length > 0 ||
                          getFieldError("email").length > 0)
                      }
                    >
                      <FieldLabel htmlFor="field-email">Email</FieldLabel>
                      <FieldContent>
                        <Input
                          id="field-email"
                          type="email"
                          autoComplete="email"
                          spellCheck={false}
                          placeholder="anna@example.com"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) =>
                            formField.handleChange(event.target.value)
                          }
                          aria-invalid={
                            (formField.state.meta.isTouched ||
                              form.state.submissionAttempts > 0) &&
                            (formField.state.meta.errors.length > 0 ||
                              getFieldError("email").length > 0)
                          }
                        />
                        <FieldError
                          errors={[
                            ...getClientFieldErrors(
                              formField.state.meta.errors,
                            ).map((message) => ({ message })),
                            ...getFieldError("email").map((message) => ({
                              message,
                            })),
                          ]}
                        />
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="role">
                  {(formField) => (
                    <Field>
                      <FieldLabel>Role</FieldLabel>
                      <FieldContent>
                        <Select
                          value={formField.state.value}
                          onValueChange={(value) =>
                            formField.handleChange(
                              value as ShadowMemberFormValues["role"],
                            )
                          }
                          disabled={roleOptions.length === 1}
                        >
                          <SelectTrigger className="h-11 w-full px-4">
                            <SelectValue placeholder="Choose role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {roleOptions.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {role === "org_admin"
                                    ? "Org admin"
                                    : role.charAt(0).toUpperCase() +
                                      role.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {roleOptions.length === 1 ? (
                          <FieldDescription>
                            Scoped admins can only create members with the
                            standard member role.
                          </FieldDescription>
                        ) : null}
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="status">
                  {(formField) => (
                    <Field>
                      <FieldLabel>Status</FieldLabel>
                      <FieldContent>
                        <Select
                          value={formField.state.value}
                          onValueChange={(value) =>
                            formField.handleChange(
                              value as ShadowMemberFormValues["status"],
                            )
                          }
                        >
                          <SelectTrigger className="h-11 w-full px-4">
                            <SelectValue placeholder="Choose status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="invited">Invited</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="archived">Archived</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>
              </div>

              <form.Field name="groupIds">
                {(formField) => (
                  <MemberGroupAssignmentField
                    categories={manageableGroupCategories}
                    groupIds={formField.state.value}
                    description={
                      accessLevel === "full"
                        ? "Assign the member to any active groups now, or leave them unassigned."
                        : "Assign at least one group you manage so this new member stays inside your delegated scope."
                    }
                    error={getFieldError("groupIds")[0]}
                    onChange={(value) => formField.handleChange(value)}
                  />
                )}
              </form.Field>

              {activeCustomFields.length > 0 ? (
                <>
                  <Separator />
                  <Field>
                    <FieldLabel>Custom member fields</FieldLabel>
                    <FieldDescription>
                      The same fields applicants answer when they join. Leave
                      any of them empty to collect the answer later.
                    </FieldDescription>
                  </Field>

                  {activeCustomFields.map((customField) => (
                    <form.Field
                      key={customField.id}
                      name={`customFieldAnswers.${customField.key}` as never}
                    >
                      {(formField) => (
                        <MemberCustomFieldInput
                          field={customField}
                          value={formField.state.value}
                          error={customFieldErrors?.[customField.key]?.[0]}
                          onChange={(value) =>
                            formField.handleChange(value as never)
                          }
                        />
                      )}
                    </form.Field>
                  ))}
                </>
              ) : null}

              {workspaceReady ? (
                <>
                  <Separator />
                  <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <Label className="text-sm">
                        Create a Google Workspace account
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Opens the account setup step right after the member is
                        created. Leave it off to add the account later from the
                        member&apos;s page.
                      </p>
                    </div>
                    <Switch
                      checked={createAccount}
                      onCheckedChange={setCreateAccount}
                    />
                  </div>
                </>
              ) : null}

              {serverError ? (
                <div className="mt-4 rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {serverError}
                </div>
              ) : null}
            </FieldGroup>
          </div>

          <SheetFooter>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Creating..."
                : createAccount && workspaceReady
                  ? "Create profile & continue"
                  : "Create profile"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
