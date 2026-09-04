"use client";

import { useCallback, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useAction } from "next-safe-action/hooks";
import { Loader2Icon } from "lucide-react";

import {
  groupJoinPolicyOptions,
  groupSchema,
  type GroupFormValues,
} from "@/lib/groups";
import { feeCurrencyOptions } from "@/lib/membership";
import { useAppShell } from "@/components/app/app-shell-provider";
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
    isActive: group?.isActive ?? true,
    sortOrder: group?.sortOrder ?? 0,
    feeRenewalMonth: group?.feeRenewalMonth ?? null,
    feeRenewalDay: group?.feeRenewalDay ?? null,
    // Stored in minor units; the input edits whole currency units.
    feeAmount: feeToMajorUnits(group?.feeAmount) ?? null,
    feeCurrency: group?.feeCurrency ?? null,
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
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel = "Cancel",
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
  onSubmit: (value: GroupFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
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
        return;
      }

      await onSubmit(parsed.data);
    },
  });

  const getFieldError = (fieldName: keyof GroupFormValues): string[] =>
    validationErrors?.[fieldName]?._errors ?? [];
  const getClientFieldErrors = (errors: unknown) =>
    Array.isArray(errors)
      ? errors.filter(
          (message): message is string => typeof message === "string",
        )
      : [];

  // ── Workspace: org units ──
  const getOrgUnitsAction = useAction(getWorkspaceOrgUnitsAction);
  const [orgUnits, setOrgUnits] = useState<WorkspaceOrgUnit[]>([]);
  const orgUnitsFetchedRef = useRef(false);

  const ensureOrgUnitsFetched = useCallback(async () => {
    if (orgUnitsFetchedRef.current) return;
    orgUnitsFetchedRef.current = true;
    const result = await getOrgUnitsAction.executeAsync({});
    setOrgUnits(result?.data ?? []);
  }, [getOrgUnitsAction]);

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
                <FieldLabel htmlFor="group-slug">Slug *</FieldLabel>
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
                  <FieldDescription>
                    Group URLs are unique across the organization.
                  </FieldDescription>
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
              <FieldLegend>Join policy</FieldLegend>
              <FieldDescription>
                Choose how members can enter or leave this group.
              </FieldDescription>
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

        <div className="flex flex-col gap-5">
          <form.Field name="sortOrder">
            {(formField) => (
              <Field>
                <FieldLabel htmlFor="group-sort-order">Sort order</FieldLabel>
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
        <FieldLegend>Notifications</FieldLegend>
        <FieldDescription>
          {categoryNotifiesOnRegistration
            ? "This group's admins are emailed when an applicant picks this group on the join form."
            : "This category does not notify anyone about new applications yet — turn that on in the category settings to use what follows."}
        </FieldDescription>

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
                  <FieldDescription>
                    Optional. Always emailed alongside whoever is resolved above.
                  </FieldDescription>
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
          <FieldLegend>Workspace integration</FieldLegend>
          <FieldDescription>
            Members of this group are moved into the org unit below when they
            are assigned. Google group membership is managed separately, under
            Linked Google groups.
          </FieldDescription>

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
                      onOpenChange={(open) => {
                        if (open) void ensureOrgUnitsFetched();
                      }}
                      disabled={!canManageWorkspaceIntegration}
                    >
                      <SelectTrigger id="group-workspace-ou">
                        {getOrgUnitsAction.isPending ? (
                          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                        ) : (
                          <SelectValue placeholder="Select org unit…" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {orgUnits.map((ou) => (
                          <SelectItem
                            key={ou.orgUnitPath}
                            value={ou.orgUnitPath}
                          >
                            {ou.orgUnitPath}
                          </SelectItem>
                        ))}
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
          <FieldLegend>Membership fee overrides</FieldLegend>
          <FieldDescription>
            Leave fields empty to use the organization defaults. Fill in only
            the values this group should override.
          </FieldDescription>

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
                    <FieldDescription>
                      {formatOrgDefault(
                        orgFeeDefaults?.renewalMonth != null
                          ? (MONTH_NAMES[orgFeeDefaults.renewalMonth - 1] ?? "")
                          : "",
                        orgFeeDefaults?.renewalMonth,
                      )}
                    </FieldDescription>
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
                    <FieldDescription>
                      {formatOrgDefault(
                        orgFeeDefaults?.renewalDay != null
                          ? String(orgFeeDefaults.renewalDay)
                          : "",
                        orgFeeDefaults?.renewalDay,
                      )}
                    </FieldDescription>
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

          <div className="grid gap-5 md:grid-cols-2">
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
                  <FieldLabel htmlFor="group-fee-amount">Fee amount</FieldLabel>
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
                    <FieldDescription>
                      {formatOrgDefault(
                        orgFeeDefaults?.feeAmount != null
                          ? `${feeToMajorUnits(orgFeeDefaults.feeAmount)} ${orgFeeDefaults.feeCurrency}`
                          : "",
                        orgFeeDefaults?.feeAmount,
                      )}
                    </FieldDescription>
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

            <form.Field name="feeCurrency">
              {(formField) => (
                <Field>
                  <FieldLabel htmlFor="group-fee-currency">Currency</FieldLabel>
                  <FieldContent>
                    <Select
                      value={formField.state.value ?? ""}
                      onValueChange={(v) => formField.handleChange(v || null)}
                    >
                      <SelectTrigger id="group-fee-currency">
                        <SelectValue placeholder="Use org default" />
                      </SelectTrigger>
                      <SelectContent>
                        {feeCurrencyOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {formatOrgDefault(
                        orgFeeDefaults?.feeCurrency ?? "",
                        orgFeeDefaults?.feeCurrency,
                      )}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            </form.Field>
          </div>

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
                  <FieldDescription>
                    {formatOrgDefault(
                      orgFeeDefaults?.paymentWindowDays != null
                        ? `${orgFeeDefaults.paymentWindowDays} days`
                        : "",
                      orgFeeDefaults?.paymentWindowDays,
                    )}
                  </FieldDescription>
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
                  <FieldDescription>
                    {formatOrgDefault(
                      orgFeeDefaults?.feeBankAccount ?? "",
                      orgFeeDefaults?.feeBankAccount,
                    )}
                  </FieldDescription>
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
    </form>
  );
}
