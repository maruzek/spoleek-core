"use client";

import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { AlertTriangleIcon, InfoIcon, Trash2Icon } from "lucide-react";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineDot,
  TimelineHeader,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "@/components/ui/timeline";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import {
  type UpdateMemberValues,
  updateMemberSchema,
} from "@/lib/member-admin";
import type { MemberCustomField, TenantMember } from "@/server/db/schema";
import type { MemberEditorMetadata } from "@/server/queries/members";

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
  metadata: MemberEditorMetadata;
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

function DefinitionRow({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start">
      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0">
        <div className="text-sm font-medium text-foreground">{value}</div>
        {description ? (
          <div className="pt-0.5 text-sm text-muted-foreground">{description}</div>
        ) : null}
      </dd>
    </div>
  );
}

export function MemberEditSheet({
  canDelete,
  customFields,
  isDeletePending,
  isPending,
  member,
  metadata,
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

  const accountType = member.userId ? "Linked account" : "Shadow profile";
  const inviteSummary = useMemo(() => {
    if (!member.email) {
      return {
        value: "No email on file",
        description: "Invites stay disabled until the member has an email address.",
      };
    }

    if (!metadata.inviteState.status) {
      return {
        value: "No invite sent",
        description: "This member has not received an activation email yet.",
      };
    }

    const issue =
      metadata.inviteState.deliveryStatus &&
      metadata.inviteState.deliveryStatus !== "pending" &&
      metadata.inviteState.deliveryStatus !== "sent"
        ? `Delivery ${metadata.inviteState.deliveryStatus.replace("_", " ")}.`
        : undefined;

    return {
      value: metadata.inviteState.status.replace("_", " "),
      description: metadata.inviteState.lastError ?? issue ?? "Invite state is healthy.",
    };
  }, [
    member.email,
    metadata.inviteState.deliveryStatus,
    metadata.inviteState.lastError,
    metadata.inviteState.status,
  ]);

  const metadataRows = [
    {
      label: "Account",
      value: accountType,
      description: metadata.linkedUserName ?? "No linked user name recorded.",
    },
    {
      label: "Membership",
      value: member.status.replace("_", " "),
      description: member.role.replace("_", " "),
    },
    {
      label: "Email",
      value: member.email ?? "No email yet",
      description: member.email ? "Primary contact used for activation." : "Add an email to enable invite delivery.",
    },
    {
      label: "Invite",
      value: inviteSummary.value,
      description: inviteSummary.description,
    },
    {
      label: "Primary group",
      value: metadata.primaryGroup?.name ?? "No group yet",
      description: metadata.primaryGroup
        ? `${metadata.primaryGroup.categoryName}${
            metadata.primaryGroup.role === "group_admin" ? " • Group admin" : ""
          }`
        : "No active group assignment found.",
    },
    {
      label: "Assignments",
      value: `${metadata.groupAssignments.length}`,
      description:
        metadata.groupAssignments.length === 1
          ? "Active group assignment"
          : "Active group assignments",
    },
  ];

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
            <div className="mb-6 rounded-2xl border bg-muted/20 px-4 py-3">
              <Accordion type="multiple" className="gap-2">
                <AccordionItem value="known-metadata" className="border-none">
                  <AccordionTrigger className="py-1 hover:no-underline">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        Known Metadata
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Linked account, invite health, group assignment, and
                        custom-field context.
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <dl className="divide-y">
                      {metadataRows.map((item) => (
                        <DefinitionRow
                          key={item.label}
                          label={item.label}
                          value={item.value}
                          description={item.description}
                        />
                      ))}
                    </dl>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="group-assignments" className="border-none">
                  <AccordionTrigger className="py-1 hover:no-underline">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        Group Assignments
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Every active assignment, grouped by category and role.
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="flex flex-col gap-3">
                      {metadata.groupAssignments.length > 0 ? (
                        metadata.groupAssignments.map((assignment, index) => (
                          <div key={assignment.id} className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {assignment.name}
                              </span>
                              <Badge variant="outline">
                                {assignment.categoryName}
                              </Badge>
                              {assignment.role === "group_admin" ? (
                                <Badge variant="secondary">Group admin</Badge>
                              ) : null}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Assigned {formatDateTime(assignment.assignedAt)}
                            </div>
                            {index < metadata.groupAssignments.length - 1 ? (
                              <Separator />
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No active assignments.
                        </span>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="custom-field-snapshot" className="border-none">
                  <AccordionTrigger className="py-1 hover:no-underline">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        Custom Field Snapshot
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Non-empty answers shown as a clean reference list.
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    {metadata.customFieldDetails.length > 0 ? (
                      <dl className="divide-y">
                        {metadata.customFieldDetails.map((item) => (
                          <DefinitionRow
                            key={item.key}
                            label={item.label}
                            value={item.displayValue}
                          />
                        ))}
                      </dl>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No custom member data recorded yet.
                      </span>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="membership-timeline" className="border-none">
                  <AccordionTrigger className="py-1 hover:no-underline">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        Membership Timeline
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Creation, invite milestones, account linking, and key
                        legal or group events.
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    {metadata.memberTimeline.length > 0 ? (
                      <Timeline activeIndex={metadata.memberTimeline.length - 1}>
                        {metadata.memberTimeline.map((event, index) => (
                          <TimelineItem key={event.id}>
                            <TimelineHeader>
                              <TimelineDot />
                              {index < metadata.memberTimeline.length - 1 ? (
                                <TimelineConnector />
                              ) : null}
                            </TimelineHeader>
                            <TimelineContent>
                              <TimelineTime dateTime={event.date.toISOString()}>
                                {formatDateTime(event.date)}
                              </TimelineTime>
                              <TimelineTitle>{event.title}</TimelineTitle>
                              <TimelineDescription>
                                {event.description}
                              </TimelineDescription>
                            </TimelineContent>
                          </TimelineItem>
                        ))}
                      </Timeline>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No timeline events available.
                      </span>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

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
                          autoComplete="given-name"
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
                          autoComplete="family-name"
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
                          autoComplete="email"
                          spellCheck={false}
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
                    <AlertDialogTitle>
                      Delete {member.firstName} {member.lastName}?
                    </AlertDialogTitle>
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
