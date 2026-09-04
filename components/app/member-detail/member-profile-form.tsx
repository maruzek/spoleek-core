"use client";

import { useForm } from "@tanstack/react-form";
import { InfoIcon } from "lucide-react";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import { MemberGroupAssignmentField } from "@/components/app/member-group-assignment-field";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/code-block/copy-button";
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type UpdateMemberValues, updateMemberSchema } from "@/lib/member-admin";
import {
  describeApprovalRequirement,
  requiresApprovalFlow,
} from "@/lib/member-status-transitions";
import type { MemberCustomField, TenantMember, TenantRole } from "@/server/db/schema";
import type { MemberManagementGroupCategory } from "@/server/lib/member-management-scope";
import type { MemberEditorMetadata } from "@/server/queries/members";

type EditableMemberStatus = Exclude<TenantMember["status"], "deleted">;
type EditableMember = Omit<TenantMember, "status"> & {
  status: EditableMemberStatus;
};
type ValidationFieldError =
  | { _errors?: string[] }
  | Array<{ _errors?: string[] }>
  | undefined;
export type MemberEditValidationErrors = Partial<
  Record<keyof UpdateMemberValues, Exclude<ValidationFieldError, undefined>>
>;

const STATUS_OPTIONS: Array<{ value: EditableMemberStatus; label: string }> = [
  { value: "invited", label: "Invited" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "archived", label: "Archived" },
];

function toDefaultValues(
  member: EditableMember,
  metadata: MemberEditorMetadata,
  customFieldAnswers: Record<string, unknown>,
): UpdateMemberValues {
  return {
    memberId: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email ?? "",
    role: member.role,
    status: member.status,
    groupIds: metadata.groupAssignments.map((assignment) => assignment.id),
    customFieldAnswers,
  };
}

/**
 * The editable member record, lifted out of the old side sheet so the detail
 * page owns editing. Same schema, same action — only the frame changed.
 */
export function MemberProfileForm({
  accessLevel,
  customFields,
  customFieldAnswers,
  customFieldErrors,
  isPending,
  manageableGroupCategories,
  member,
  metadata,
  roleOptions,
  serverError,
  validationErrors,
  onCancel,
  onSubmit,
}: {
  accessLevel: "full" | "scoped";
  customFields: MemberCustomField[];
  customFieldAnswers: Record<string, unknown>;
  customFieldErrors?: Record<string, string[]>;
  isPending: boolean;
  manageableGroupCategories: MemberManagementGroupCategory[];
  member: EditableMember;
  metadata: MemberEditorMetadata;
  roleOptions: TenantRole[];
  serverError?: string;
  validationErrors?: MemberEditValidationErrors;
  onCancel: () => void;
  onSubmit: (value: UpdateMemberValues) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: toDefaultValues(member, metadata, customFieldAnswers),
    onSubmit: async ({ value }) => {
      const parsed = updateMemberSchema.safeParse(value);

      if (!parsed.success) {
        return;
      }

      await onSubmit(parsed.data);
    },
  });

  const getFieldError = (fieldName: keyof UpdateMemberValues): string[] => {
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

  const showFieldError = (
    fieldName: keyof UpdateMemberValues,
    meta: { isTouched: boolean; errors: unknown[] },
  ) =>
    (meta.isTouched || form.state.submissionAttempts > 0) &&
    (meta.errors.length > 0 || getFieldError(fieldName).length > 0);

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
        <div className="grid gap-5 md:grid-cols-2">
          <form.Field name="firstName">
            {(formField) => (
              <Field
                data-invalid={showFieldError("firstName", formField.state.meta)}
              >
                <FieldLabel htmlFor="member-first-name">First name *</FieldLabel>
                <FieldContent>
                  <Input
                    id="member-first-name"
                    autoComplete="given-name"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) =>
                      formField.handleChange(event.target.value)
                    }
                    aria-invalid={showFieldError(
                      "firstName",
                      formField.state.meta,
                    )}
                  />
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map(
                        (message) => ({ message }),
                      ),
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
                data-invalid={showFieldError("lastName", formField.state.meta)}
              >
                <FieldLabel htmlFor="member-last-name">Last name *</FieldLabel>
                <FieldContent>
                  <Input
                    id="member-last-name"
                    autoComplete="family-name"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) =>
                      formField.handleChange(event.target.value)
                    }
                    aria-invalid={showFieldError(
                      "lastName",
                      formField.state.meta,
                    )}
                  />
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map(
                        (message) => ({ message }),
                      ),
                      ...getFieldError("lastName").map((message) => ({
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
                      formField.handleChange(value as UpdateMemberValues["role"])
                    }
                    disabled={roleOptions.length === 1}
                  >
                    <SelectTrigger className="w-full px-4">
                      <SelectValue placeholder="Choose role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {roleOptions.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role === "org_admin"
                              ? "Org admin"
                              : role.charAt(0).toUpperCase() + role.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {roleOptions.length === 1 ? (
                    <FieldDescription>
                      Scoped admins can only manage members with the standard
                      member role.
                    </FieldDescription>
                  ) : null}
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="status">
            {(formField) => {
              const blockedTarget = STATUS_OPTIONS.find(
                (option) =>
                  option.value === formField.state.value &&
                  requiresApprovalFlow(member.status, option.value),
              );

              return (
                <Field data-invalid={Boolean(blockedTarget)}>
                  <FieldLabel>Status</FieldLabel>
                  <FieldContent>
                    <Select
                      value={formField.state.value}
                      onValueChange={(value) =>
                        formField.handleChange(
                          value as UpdateMemberValues["status"],
                        )
                      }
                    >
                      <SelectTrigger className="w-full px-4">
                        <SelectValue placeholder="Choose status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {STATUS_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              disabled={requiresApprovalFlow(
                                member.status,
                                option.value,
                              )}
                            >
                              {option.label}
                              {requiresApprovalFlow(member.status, option.value)
                                ? " — needs approval"
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {blockedTarget ? (
                      <FieldError
                        errors={[
                          {
                            message: describeApprovalRequirement(
                              blockedTarget.value,
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <FieldError
                        errors={getFieldError("status").map((message) => ({
                          message,
                        }))}
                      />
                    )}
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>
        </div>

        <form.Field name="email">
          {(formField) => (
            <Field data-invalid={showFieldError("email", formField.state.meta)}>
              <FieldLabel htmlFor="member-email">Email</FieldLabel>
              <FieldContent>
                <InputGroup>
                  <InputGroupInput
                    id="member-email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) =>
                      formField.handleChange(event.target.value)
                    }
                    aria-invalid={showFieldError("email", formField.state.meta)}
                  />
                  {formField.state.value.trim().length > 0 ? (
                    <InputGroupAddon align="inline-end">
                      <CopyButton
                        content={formField.state.value.trim()}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Copy personal email"
                        title="Copy personal email"
                      />
                    </InputGroupAddon>
                  ) : null}
                </InputGroup>
                <FieldError
                  errors={[
                    ...getClientFieldErrors(formField.state.meta.errors).map(
                      (message) => ({ message }),
                    ),
                    ...getFieldError("email").map((message) => ({ message })),
                  ]}
                />
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <Separator />

        <form.Field name="groupIds">
          {(formField) => (
            <MemberGroupAssignmentField
              categories={manageableGroupCategories}
              groupIds={formField.state.value}
              description={
                accessLevel === "full"
                  ? "Adjust active group assignments for this member."
                  : "You can manage assignments inside the groups you administer. If you remove the last in-scope group, this member will disappear from your table after save."
              }
              error={getFieldError("groupIds")[0]}
              onChange={(value) => formField.handleChange(value)}
            />
          )}
        </form.Field>

        {customFields.length > 0 ? (
          <>
            <Separator />
            <Field>
              <FieldLabel className="flex items-center gap-2">
                Custom member fields
                <Tooltip>
                  <TooltipTrigger className="focus:outline-none" asChild>
                    <InfoIcon className="size-4 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      These organization-defined fields stay editable here, even
                      when a field is currently inactive elsewhere.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
            </Field>
          </>
        ) : null}

        {customFields.map((field) => (
          <MemberCustomFieldInput
            key={field.id}
            field={field}
            value={form.state.values.customFieldAnswers[field.key]}
            error={customFieldErrors?.[field.key]?.[0]}
            onChange={(value) =>
              form.setFieldValue("customFieldAnswers", {
                ...form.state.values.customFieldAnswers,
                [field.key]: value,
              })
            }
          />
        ))}

        {serverError ? (
          <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}
      </FieldGroup>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
