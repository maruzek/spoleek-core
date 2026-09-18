"use client";

import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useAction } from "next-safe-action/hooks";
import { FolderTreeIcon, Loader2Icon } from "lucide-react";

import {
  groupJoinPolicyOptions,
  groupPageVisibilityOptions,
  groupSchema,
  type GroupFormValues,
} from "@/lib/groups";
import { useAppShell } from "@/components/app/app-shell-provider";
import { flattenSchemaErrors } from "@/lib/form-errors";
import { slugify } from "@/lib/slugify";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldTitle,
} from "@/components/ui/field";
import { SwitchChoiceField } from "@/components/app/switch-choice-field";
import { FieldHint } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultWorkspaceLinkSettings,
  type WorkspaceLinkSettings,
} from "@/lib/workspace-group-links";
import {
  WorkspaceGroupPicker,
  WorkspaceLinkSettingsFields,
} from "@/components/app/workspace-link-fields";
import { getWorkspaceOrgUnitsAction } from "@/server/actions/workspace";
import { resolveEffectiveVisibility } from "@/lib/groups/portal-actions";
import { feeToMajorUnits, feeToMinorUnits } from "@/lib/payments";
import type { WorkspaceOrgUnit } from "@/server/lib/workspace/client";

export type GroupValidationErrors = Partial<
  Record<keyof GroupFormValues, { _errors?: string[] }>
>;

function toDefaultValues(
  group?: Partial<GroupFormValues> | null,
  categoryId?: string,
): GroupFormValues {
  return {
    id: group?.id,
    categoryId: group?.categoryId ?? categoryId ?? "",
    name: group?.name ?? "",
    slug: group?.slug ?? "",
    description: group?.description ?? null,
    joinPolicy: group?.joinPolicy ?? "admin_only",
    pageVisibility: group?.pageVisibility ?? "inherit",
    isActive: group?.isActive ?? true,
    sortOrder: group?.sortOrder ?? 0,
    feeRenewalMonth: group?.feeRenewalMonth ?? null,
    feeRenewalDay: group?.feeRenewalDay ?? null,
    // Stored in minor units; the input edits whole currency units.
    feeAmount: feeToMajorUnits(group?.feeAmount) ?? null,
    feeBankAccount: group?.feeBankAccount ?? null,
    feePaymentWindowDays: group?.feePaymentWindowDays ?? null,
    workspaceOrgUnitPath: group?.workspaceOrgUnitPath ?? null,
    notifyViaWorkspaceGroup: group?.notifyViaWorkspaceGroup ?? false,
    notificationEmail: group?.notificationEmail ?? null,
    workspaceLink: group?.workspaceLink ?? null,
  };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatOrgDefault(
  label: string,
  value: string | number | null | undefined,
): string {
  if (value == null) return `Org default: not set`;
  return `Org default: ${label}`;
}

export function GroupForm({
  categoryId,
  group,
  isPending,
  validationErrors,
  categoryManagesFees,
  workspaceConnected,
  canManageWorkspaceIntegration = false,
  isWorkspaceOrgUnitCategory,
  linkedWorkspaceGroupEmail = null,
  categoryNotifiesOnRegistration = false,
  categoryGroupPagesVisibleToAllMembers = false,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel = "Cancel",
  id,
  hideFooter = false,
}: {
  categoryId: string;
  group?: Partial<GroupFormValues> | null;
  isPending: boolean;
  validationErrors?: GroupValidationErrors;
  categoryManagesFees?: boolean;
  workspaceConnected?: boolean;
  canManageWorkspaceIntegration?: boolean;
  isWorkspaceOrgUnitCategory?: boolean;
  /** Address of this group's enabled Google group link, when it has one. */
  linkedWorkspaceGroupEmail?: string | null;
  categoryNotifiesOnRegistration?: boolean;
  /** The category's default for who may open group pages; shown on the "inherit" option. */
  categoryGroupPagesVisibleToAllMembers?: boolean;
  onSubmit: (value: GroupFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  /** Lets a dialog place its own submit button (`<Button form={id}>`) in a sticky footer. */
  id?: string;
  hideFooter?: boolean;
}) {
  const {
    organization: { fees: orgFeeDefaults },
  } = useAppShell();
  const form = useForm({
    defaultValues: toDefaultValues(group, categoryId),
    onSubmit: async ({ value }) => {
      const parsed = groupSchema.safeParse({
        ...value,
        feeAmount: feeToMinorUnits(value.feeAmount),
      });

      if (!parsed.success) {
        setSchemaErrors(flattenSchemaErrors(parsed.error));
        return;
      }

      setSchemaErrors({});
      await onSubmit(parsed.data);
    },
  });

  // Schema failures found on the client (including cross-field rules from
  // `superRefine`, which per-field validators never see) are surfaced through
  // the same channel as server validation errors, so the field shows them.
  const [schemaErrors, setSchemaErrors] = useState<Partial<Record<keyof GroupFormValues, string[]>>>({});
  const getFieldError = (fieldName: keyof GroupFormValues): string[] => [
    ...(schemaErrors[fieldName] ?? []),
    ...(validationErrors?.[fieldName]?._errors ?? []),
  ];
  const getClientFieldErrors = (errors: unknown) =>
    Array.isArray(errors)
      ? errors.filter(
          (message): message is string => typeof message === "string",
        )
      : [];

  // ── Workspace: org units ──
  // Fetched as soon as the field is on screen rather than on first open, so
  // the menu never pops up half-empty and then jumps when the paths arrive.
  const showOrgUnitField = Boolean(workspaceConnected && isWorkspaceOrgUnitCategory);
  const { execute: fetchOrgUnits, result: orgUnitsResult, status: orgUnitsStatus } =
    useAction(getWorkspaceOrgUnitsAction);
  useEffect(() => {
    if (showOrgUnitField) fetchOrgUnits({});
  }, [showOrgUnitField, fetchOrgUnits]);
  const orgUnits: WorkspaceOrgUnit[] = orgUnitsResult.data ?? [];
  const orgUnitsLoading = orgUnitsStatus === "idle" || orgUnitsStatus === "executing";

  return (
    <form
      id={id}
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <div className="grid gap-5 md:grid-cols-2">
          <form.Field name="name">
            {(formField) => (
              <Field
                data-invalid={
                  (formField.state.meta.isTouched ||
                    form.state.submissionAttempts > 0) &&
                  (formField.state.meta.errors.length > 0 ||
                    getFieldError("name").length > 0)
                }
              >
                <FieldLabel htmlFor="group-name">Name *</FieldLabel>
                <FieldContent>
                  <Input
                    id="group-name"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => {
                      formField.handleChange(event.target.value);
                      form.setFieldValue("slug", slugify(event.target.value));
                    }}
                    aria-invalid={
                      (formField.state.meta.isTouched ||
                        form.state.submissionAttempts > 0) &&
                      (formField.state.meta.errors.length > 0 ||
                        getFieldError("name").length > 0)
                    }
                  />
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map(
                        (message) => ({
                          message,
                        }),
                      ),
                      ...getFieldError("name").map((message) => ({ message })),
                    ]}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="slug">
            {(formField) => (
              <Field
                data-invalid={
                  (formField.state.meta.isTouched ||
                    form.state.submissionAttempts > 0) &&
                  (formField.state.meta.errors.length > 0 ||
                    getFieldError("slug").length > 0)
                }
              >
                <FieldLabel htmlFor="group-slug">
                  Slug *
                  <FieldHint>Used in URLs. Group slugs are unique across the organization.</FieldHint>
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="group-slug"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) =>
                      formField.handleChange(event.target.value)
                    }
                    aria-invalid={
                      (formField.state.meta.isTouched ||
                        form.state.submissionAttempts > 0) &&
                      (formField.state.meta.errors.length > 0 ||
                        getFieldError("slug").length > 0)
                    }
                  />
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map(
                        (message) => ({
                          message,
                        }),
                      ),
                      ...getFieldError("slug").map((message) => ({ message })),
                    ]}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </div>

        <form.Field name="description">
          {(formField) => (
            <Field>
              <FieldLabel htmlFor="group-description">Description</FieldLabel>
              <FieldContent>
                <Textarea
                  id="group-description"
                  value={formField.state.value ?? ""}
                  onBlur={formField.handleBlur}
                  onChange={(event) =>
                    formField.handleChange(
                      event.target.value.length > 0 ? event.target.value : null,
                    )
                  }
                />
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <form.Field name="joinPolicy">
          {(formField) => (
            <FieldSet>
              <FieldLegend className="flex items-center gap-2">
                Join policy
                <FieldHint>How members enter or leave this group.</FieldHint>
              </FieldLegend>
              <RadioGroup
                value={formField.state.value}
                onValueChange={(value) =>
                  formField.handleChange(value as GroupFormValues["joinPolicy"])
                }
                className="max-w-2xl"
              >
                {groupJoinPolicyOptions.map((option) => {
                  const id = `group-join-policy-${option.value}`;

                  return (
                    <FieldLabel key={option.value} htmlFor={id}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>{option.label}</FieldTitle>
                          <FieldDescription>
                            {option.description}
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value={option.value} id={id} />
                      </Field>
                    </FieldLabel>
                  );
                })}
              </RadioGroup>
            </FieldSet>
          )}
        </form.Field>

        <form.Field name="pageVisibility">
          {(formField) => {
            const inherited = resolveEffectiveVisibility(
              { pageVisibility: "inherit" },
              { groupPagesVisibleToAllMembers: categoryGroupPagesVisibleToAllMembers },
            );
            const inheritedLabel = groupPageVisibilityOptions.find((o) => o.value === inherited)?.label ?? "";

            return (
              <FieldSet>
                <FieldLegend className="flex items-center gap-2">
                  Group page
                  <FieldHint>
                    Who may open this group&apos;s page on the member portal. The roster is only ever
                    shown to the group&apos;s own members.
                  </FieldHint>
                </FieldLegend>
                <RadioGroup
                  value={formField.state.value}
                  onValueChange={(value) =>
                    formField.handleChange(value as GroupFormValues["pageVisibility"])
                  }
                  className="max-w-2xl"
                >
                  {groupPageVisibilityOptions.map((option) => {
                    const id = `group-page-visibility-${option.value}`;

                    return (
                      <FieldLabel key={option.value} htmlFor={id}>
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>
                              {option.label}
                              {option.value === "inherit" ? (
                                <span className="ml-1.5 font-normal text-muted-foreground">
                                  (currently: {inheritedLabel.toLowerCase()})
                                </span>
                              ) : null}
                            </FieldTitle>
                            <FieldDescription>{option.description}</FieldDescription>
                          </FieldContent>
                          <RadioGroupItem value={option.value} id={id} />
                        </Field>
                      </FieldLabel>
                    );
                  })}
                </RadioGroup>
              </FieldSet>
            );
          }}
        </form.Field>

        <div className="flex flex-col gap-5">
          <form.Field name="sortOrder">
            {(formField) => (
              <Field>
                <FieldLabel htmlFor="group-sort-order">
                  Sort order
                  <FieldHint>Lower numbers come first wherever this category&apos;s groups are listed.</FieldHint>
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="group-sort-order"
                    type="number"
                    min={0}
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) =>
                      formField.handleChange(Number(event.target.value))
                    }
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="isActive">
            {(formField) => (
              <SwitchChoiceField
                id="group-active"
                title="Active group"
                description="Archived groups remain visible in admin history but stop acting like live structure."
                checked={formField.state.value}
                onCheckedChange={formField.handleChange}
              />
            )}
          </form.Field>
        </div>
      </FieldGroup>
      <FieldSet>
        <FieldLegend className="flex items-center gap-2">
          Notifications
          <FieldHint>
            This group&apos;s admins are emailed when an applicant picks this group on the join form.
          </FieldHint>
        </FieldLegend>
        {categoryNotifiesOnRegistration ? null : (
          <FieldDescription>
            This category does not notify anyone about new applications yet — turn that on in the
            category settings to use what follows.
          </FieldDescription>
        )}

        <div className="flex flex-col gap-5">
          {linkedWorkspaceGroupEmail ? (
            <form.Field name="notifyViaWorkspaceGroup">
              {(formField) => (
                <SwitchChoiceField
                  id="group-notify-via-workspace-group"
                  title="Send to the linked Google group"
                  description={`One email to ${linkedWorkspaceGroupEmail} instead of one to each group admin. Google fans it out, and admins are already members of that group — so nobody loses the message.`}
                  checked={formField.state.value}
                  onCheckedChange={formField.handleChange}
                />
              )}
            </form.Field>
          ) : null}

          <form.Field name="notificationEmail">
            {(formField) => (
              <Field data-invalid={getFieldError("notificationEmail").length > 0}>
                <FieldLabel htmlFor="group-notification-email">
                  Extra address
                  <FieldHint>Optional. Always emailed alongside whoever is resolved above.</FieldHint>
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="group-notification-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder="team@example.org"
                    value={formField.state.value ?? ""}
                    onBlur={formField.handleBlur}
                    onChange={(event) =>
                      formField.handleChange(
                        event.target.value.length > 0 ? event.target.value : null,
                      )
                    }
                    aria-invalid={getFieldError("notificationEmail").length > 0}
                  />
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map(
                        (message) => ({ message }),
                      ),
                      ...getFieldError("notificationEmail").map((message) => ({
                        message,
                      })),
                    ]}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </div>
      </FieldSet>

      {workspaceConnected && canManageWorkspaceIntegration && !group?.id ? (
        <FieldSet>
          <FieldLegend>Linked Google group</FieldLegend>
          <FieldDescription>
            Optional. Members you add to this group are kept in step with one
            Google group. You can change or remove this later in the
            group&apos;s settings.
          </FieldDescription>

          <form.Field name="workspaceLink">
            {(formField) => {
              const value = formField.state.value;

              return (
                <div className="flex min-w-0 flex-col gap-6">
                  <WorkspaceGroupPicker
                    id="group-create-workspace-link"
                    value={value?.workspaceGroupKey ?? null}
                    onValueChange={(next) =>
                      formField.handleChange(
                        next
                          ? {
                              ...defaultWorkspaceLinkSettings,
                              ...(value ?? {}),
                              workspaceGroupKey: next,
                            }
                          : null,
                      )
                    }
                  />

                  {value ? (
                    <WorkspaceLinkSettingsFields
                      value={value}
                      onChange={(next: WorkspaceLinkSettings) =>
                        formField.handleChange({
                          ...next,
                          workspaceGroupKey: value.workspaceGroupKey,
                        })
                      }
                      groupEmail={value.workspaceGroupKey}
                    />
                  ) : null}
                </div>
              );
            }}
          </form.Field>
        </FieldSet>
      ) : null}

      {workspaceConnected && isWorkspaceOrgUnitCategory ? (
        <FieldSet>
          <FieldLegend className="flex items-center gap-2">
            Workspace integration
            <FieldHint>
              Members of this group are moved into the org unit below when they are assigned.
              Google group membership is managed separately, under Linked Google groups.
            </FieldHint>
          </FieldLegend>

          {isWorkspaceOrgUnitCategory ? (
            <form.Field name="workspaceOrgUnitPath">
              {(formField) => (
                <Field>
                  <FieldLabel htmlFor="group-workspace-ou">
                    Workspace org unit path
                  </FieldLabel>
                  <FieldContent>
                    <Select
                      value={formField.state.value ?? "__none__"}
                      onValueChange={(v) =>
                        formField.handleChange(v === "__none__" ? null : v)
                      }
                      disabled={!canManageWorkspaceIntegration}
                    >
                      <SelectTrigger id="group-workspace-ou" className="w-full">
                        {/* The value is rendered by hand: Radix only knows the
                            label of an item that exists, and the saved path is
                            valid before the list has arrived. */}
                        <SelectValue placeholder="Select org unit…">
                          <FolderTreeIcon className="text-muted-foreground" aria-hidden />
                          <span className={formField.state.value ? "font-mono" : "text-muted-foreground"}>
                            {formField.state.value ?? "None"}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {orgUnitsLoading ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                            <Loader2Icon className="size-4 animate-spin" aria-hidden />
                            Loading org units…
                          </div>
                        ) : orgUnits.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No org units found in Workspace.
                          </div>
                        ) : (
                          orgUnits.map((ou) => (
                            <SelectItem key={ou.orgUnitPath} value={ou.orgUnitPath} className="font-mono">
                              {ou.orgUnitPath}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {formField.state.value ? (
                      <FieldDescription>
                        Members assigned here will be moved to{" "}
                        <span className="font-mono text-foreground">
                          {formField.state.value}
                        </span>
                        .
                      </FieldDescription>
                    ) : null}
                  </FieldContent>
                </Field>
              )}
            </form.Field>
          ) : null}
        </FieldSet>
      ) : null}

      {categoryManagesFees ? (
        <FieldSet>
          <FieldLegend className="flex items-center gap-2">
            Membership fee overrides
            <FieldHint>
              Leave a field empty to use the organization default. Fill in only the values this
              group should override.
            </FieldHint>
          </FieldLegend>

          <div className="grid gap-5 md:grid-cols-2">
            <form.Field name="feeRenewalMonth">
              {(formField) => (
                <Field
                  data-invalid={
                    (formField.state.meta.isTouched ||
                      form.state.submissionAttempts > 0) &&
                    (formField.state.meta.errors.length > 0 ||
                      getFieldError("feeRenewalMonth").length > 0)
                  }
                >
                  <FieldLabel htmlFor="group-fee-renewal-month">
                    Renewal month
                    <FieldHint>{formatOrgDefault(
                        orgFeeDefaults?.renewalMonth != null
                          ? (MONTH_NAMES[orgFeeDefaults.renewalMonth - 1] ?? "")
                          : "",
                        orgFeeDefaults?.renewalMonth,
                      )}</FieldHint>
                  </FieldLabel>
                  <FieldContent>
                    <Select
                      value={
                        formField.state.value != null
                          ? String(formField.state.value)
                          : ""
                      }
                      onValueChange={(v) =>
                        formField.handleChange(v ? Number(v) : null)
                      }
                    >
                      <SelectTrigger id="group-fee-renewal-month">
                        <SelectValue placeholder="Use org default" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_NAMES.map((name, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError
                      errors={[
                        ...getClientFieldErrors(
                          formField.state.meta.errors,
                        ).map((m) => ({ message: m })),
                        ...getFieldError("feeRenewalMonth").map((m) => ({
                          message: m,
                        })),
                      ]}
                    />
                  </FieldContent>
                </Field>
              )}
            </form.Field>

            <form.Field name="feeRenewalDay">
              {(formField) => (
                <Field
                  data-invalid={
                    (formField.state.meta.isTouched ||
                      form.state.submissionAttempts > 0) &&
                    (formField.state.meta.errors.length > 0 ||
                      getFieldError("feeRenewalDay").length > 0)
                  }
                >
                  <FieldLabel htmlFor="group-fee-renewal-day">
                    Renewal day
                    <FieldHint>{formatOrgDefault(
                        orgFeeDefaults?.renewalDay != null
                          ? String(orgFeeDefaults.renewalDay)
                          : "",
                        orgFeeDefaults?.renewalDay,
                      )}</FieldHint>
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="group-fee-renewal-day"
                      type="number"
                      min={1}
                      max={31}
                      value={formField.state.value ?? ""}
                      onBlur={formField.handleBlur}
                      onChange={(e) =>
                        formField.handleChange(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      placeholder={
                        orgFeeDefaults?.renewalDay != null
                          ? String(orgFeeDefaults.renewalDay)
                          : ""
                      }
                    />
                    <FieldError
                      errors={[
                        ...getClientFieldErrors(
                          formField.state.meta.errors,
                        ).map((m) => ({ message: m })),
                        ...getFieldError("feeRenewalDay").map((m) => ({
                          message: m,
                        })),
                      ]}
                    />
                  </FieldContent>
                </Field>
              )}
            </form.Field>
          </div>

          <form.Field name="feeAmount">
            {(formField) => (
              <Field
                data-invalid={
                  (formField.state.meta.isTouched ||
                    form.state.submissionAttempts > 0) &&
                  (formField.state.meta.errors.length > 0 ||
                    getFieldError("feeAmount").length > 0)
                }
              >
                <FieldLabel htmlFor="group-fee-amount">
                    Fee amount
                    <FieldHint>{formatOrgDefault(
                      orgFeeDefaults?.feeAmount != null
                        ? `${feeToMajorUnits(orgFeeDefaults.feeAmount)} ${orgFeeDefaults.feeCurrency}`
                        : "",
                      orgFeeDefaults?.feeAmount,
                    )}</FieldHint>
                  </FieldLabel>
                <FieldContent>
                  <Input
                    id="group-fee-amount"
                    type="number"
                    min={0}
                    value={formField.state.value ?? ""}
                    onBlur={formField.handleBlur}
                    onChange={(e) =>
                      formField.handleChange(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    placeholder={
                      orgFeeDefaults?.feeAmount != null
                        ? String(feeToMajorUnits(orgFeeDefaults.feeAmount))
                        : ""
                    }
                  />
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(
                        formField.state.meta.errors,
                      ).map((m) => ({ message: m })),
                      ...getFieldError("feeAmount").map((m) => ({
                        message: m,
                      })),
                    ]}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="feePaymentWindowDays">
            {(formField) => (
              <Field
                data-invalid={
                  (formField.state.meta.isTouched ||
                    form.state.submissionAttempts > 0) &&
                  (formField.state.meta.errors.length > 0 ||
                    getFieldError("feePaymentWindowDays").length > 0)
                }
              >
                <FieldLabel htmlFor="group-fee-payment-window">
                    Payment window (days)
                    <FieldHint>{formatOrgDefault(
                      orgFeeDefaults?.paymentWindowDays != null
                        ? `${orgFeeDefaults.paymentWindowDays} days`
                        : "",
                      orgFeeDefaults?.paymentWindowDays,
                    )}</FieldHint>
                  </FieldLabel>
                <FieldContent>
                  <Input
                    id="group-fee-payment-window"
                    type="number"
                    min={1}
                    max={365}
                    value={formField.state.value ?? ""}
                    onBlur={formField.handleBlur}
                    onChange={(e) =>
                      formField.handleChange(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    placeholder={
                      orgFeeDefaults?.paymentWindowDays != null
                        ? String(orgFeeDefaults.paymentWindowDays)
                        : ""
                    }
                  />
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map(
                        (m) => ({ message: m }),
                      ),
                      ...getFieldError("feePaymentWindowDays").map((m) => ({
                        message: m,
                      })),
                    ]}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="feeBankAccount">
            {(formField) => (
              <Field
                data-invalid={
                  (formField.state.meta.isTouched ||
                    form.state.submissionAttempts > 0) &&
                  (formField.state.meta.errors.length > 0 ||
                    getFieldError("feeBankAccount").length > 0)
                }
              >
                <FieldLabel htmlFor="group-fee-bank-account">
                    Bank account (IBAN)
                    <FieldHint>{formatOrgDefault(
                      orgFeeDefaults?.feeBankAccount ?? "",
                      orgFeeDefaults?.feeBankAccount,
                    )}</FieldHint>
                  </FieldLabel>
                <FieldContent>
                  <Input
                    id="group-fee-bank-account"
                    value={formField.state.value ?? ""}
                    onBlur={formField.handleBlur}
                    onChange={(e) =>
                      formField.handleChange(
                        e.target.value.length > 0 ? e.target.value : null,
                      )
                    }
                    placeholder={
                      orgFeeDefaults?.feeBankAccount ??
                      "CZ6508000000192000145399"
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map(
                        (m) => ({ message: m }),
                      ),
                      ...getFieldError("feeBankAccount").map((m) => ({
                        message: m,
                      })),
                    ]}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </FieldSet>
      ) : null}

      {hideFooter ? null : (
        <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Saving\u2026"
              : (submitLabel ?? (group?.id ? "Save group" : "Create group"))}
          </Button>
        </div>
      )}
    </form>
  );
}
