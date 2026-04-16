"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { AlertTriangleIcon, InfoIcon, Trash2Icon } from "lucide-react";

import {
  type UpdateMemberValues,
  updateMemberSchema,
} from "@/lib/member-admin";
import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import type { MemberCustomField, TenantMember } from "@/server/db/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type EditableMemberStatus = Exclude<TenantMember["status"], "deleted">;
type EditableMember = Omit<TenantMember, "status"> & {
  status: EditableMemberStatus;
};

type MemberEditSheetProps = {
  canDelete: boolean;
  customFields: MemberCustomField[];
  isDeletePending: boolean;
  isPending: boolean;
  member: EditableMember;
  open: boolean;
  serverError?: string;
  validationErrors?: Partial<
    Record<keyof UpdateMemberValues, { _errors?: string[] }>
  >;
  customFieldErrors?: Record<string, string[]>;
  customFieldAnswers: Record<string, unknown>;
  onDelete: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: UpdateMemberValues) => Promise<void>;
};

function toDefaultValues(
  member: EditableMember,
  customFieldAnswers: Record<string, unknown>,
): UpdateMemberValues {
  return {
    memberId: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email ?? "",
    role: member.role,
    status: member.status,
    customFieldAnswers,
  };
}

export function MemberEditSheet({
  canDelete,
  customFields,
  isDeletePending,
  isPending,
  member,
  open,
  serverError,
  validationErrors,
  customFieldErrors,
  customFieldAnswers,
  onDelete,
  onOpenChange,
  onSubmit,
}: MemberEditSheetProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const form = useForm({
    defaultValues: toDefaultValues(member, customFieldAnswers),
    onSubmit: async ({ value }) => {
      const parsed = updateMemberSchema.safeParse(value);

      if (!parsed.success) {
        return;
      }

      await onSubmit(parsed.data);
    },
  });

  const getFieldError = (fieldName: keyof UpdateMemberValues): string[] =>
    validationErrors?.[fieldName]?._errors ?? [];
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
          <SheetTitle>Edit member</SheetTitle>
          <SheetDescription>
            Update the core member record and any organization-defined custom
            fields.
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
                      <FieldLabel htmlFor="edit-member-first-name">
                        First name *
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="edit-member-first-name"
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
                      <FieldLabel htmlFor="edit-member-last-name">
                        Last name *
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="edit-member-last-name"
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
                      <FieldLabel htmlFor="edit-member-email">Email</FieldLabel>
                      <FieldContent>
                        <Input
                          id="edit-member-email"
                          type="email"
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
                              value as UpdateMemberValues["role"],
                            )
                          }
                        >
                          <SelectTrigger className="w-full px-4">
                            <SelectValue placeholder="Choose role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="leader">Leader</SelectItem>
                              <SelectItem value="org_admin">
                                Org admin
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
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
                              value as UpdateMemberValues["status"],
                            )
                          }
                        >
                          <SelectTrigger className="w-full px-4">
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

              {customFields.length > 0 ? (
                <Field>
                  <FieldLabel className="flex items-center gap-2">
                    Custom member fields
                    <Tooltip>
                      <TooltipTrigger className="focus:outline-none" asChild>
                        <InfoIcon className="size-4 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          These organization-defined fields stay editable here,
                          even when a field is currently inactive elsewhere.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                </Field>
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
          </div>

          <SheetFooter className="flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {canDelete ? (
              <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
              >
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={isPending || isDeletePending}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Delete member
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia>
                      <AlertTriangleIcon />
                    </AlertDialogMedia>
                    <AlertDialogTitle>Delete {member.firstName} {member.lastName}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This soft-deletes the member immediately, hides them from the
                      table, and schedules permanent removal after 30 days.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeletePending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={isDeletePending}
                      onClick={(event) => {
                        event.preventDefault();
                        void onDelete();
                      }}
                    >
                      {isDeletePending ? "Deleting..." : "Delete member"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <div />
            )}
            <Button type="submit" disabled={isPending || isDeletePending}>
              {isPending ? "Saving..." : "Save member"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
