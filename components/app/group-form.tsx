"use client";

import { useForm } from "@tanstack/react-form";

import {
  groupJoinPolicyOptions,
  groupSchema,
  type GroupFormValues,
} from "@/lib/groups";
import { feeCurrencyOptions } from "@/lib/membership";
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

export type GroupValidationErrors = Partial<
  Record<keyof GroupFormValues, { _errors?: string[] }>
>;

export type OrgFeeDefaults = {
  renewalMonth: number | null;
  renewalDay: number | null;
  feeAmount: number | null;
  feeCurrency: string;
  feeBankAccount: string | null;
};

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
    feeAmount: group?.feeAmount ?? null,
    feeCurrency: group?.feeCurrency ?? null,
    feeBankAccount: group?.feeBankAccount ?? null,
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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
  orgFeeDefaults,
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
  orgFeeDefaults?: OrgFeeDefaults;
  onSubmit: (value: GroupFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
}) {
  const form = useForm({
    defaultValues: toDefaultValues(group, categoryId),
    onSubmit: async ({ value }) => {
      const parsed = groupSchema.safeParse(value);

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
      ? errors.filter((message): message is string => typeof message === "string")
      : [];

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
                  (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                  (formField.state.meta.errors.length > 0 || getFieldError("name").length > 0)
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
                      (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                      (formField.state.meta.errors.length > 0 || getFieldError("name").length > 0)
                    }
                  />
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map((message) => ({
                        message,
                      })),
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
                  (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                  (formField.state.meta.errors.length > 0 || getFieldError("slug").length > 0)
                }
              >
                <FieldLabel htmlFor="group-slug">Slug *</FieldLabel>
                <FieldContent>
                  <Input
                    id="group-slug"
                    value={formField.state.value}
                    onBlur={formField.handleBlur}
                    onChange={(event) => formField.handleChange(event.target.value)}
                    aria-invalid={
                      (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                      (formField.state.meta.errors.length > 0 || getFieldError("slug").length > 0)
                    }
                  />
                  <FieldDescription>
                    Group URLs are unique across the organization.
                  </FieldDescription>
                  <FieldError
                    errors={[
                      ...getClientFieldErrors(formField.state.meta.errors).map((message) => ({
                        message,
                      })),
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
                onValueChange={(value) => formField.handleChange(value as GroupFormValues["joinPolicy"])}
                className="max-w-2xl"
              >
                {groupJoinPolicyOptions.map((option) => {
                  const id = `group-join-policy-${option.value}`;

                  return (
                    <FieldLabel key={option.value} htmlFor={id}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>{option.label}</FieldTitle>
                          <FieldDescription>{option.description}</FieldDescription>
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
                    onChange={(event) => formField.handleChange(Number(event.target.value))}
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

      {categoryManagesFees ? (
        <FieldSet>
          <FieldLegend>Membership fee overrides</FieldLegend>
          <FieldDescription>
            Leave fields empty to use the organization defaults. Fill in only the
            values this group should override.
          </FieldDescription>

          <div className="grid gap-5 md:grid-cols-2">
            <form.Field name="feeRenewalMonth">
              {(formField) => (
                <Field
                  data-invalid={
                    (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                    (formField.state.meta.errors.length > 0 || getFieldError("feeRenewalMonth").length > 0)
                  }
                >
                  <FieldLabel htmlFor="group-fee-renewal-month">
                    Renewal month
                  </FieldLabel>
                  <FieldContent>
                    <Select
                      value={formField.state.value != null ? String(formField.state.value) : ""}
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
                          ? MONTH_NAMES[orgFeeDefaults.renewalMonth - 1] ?? ""
                          : "",
                        orgFeeDefaults?.renewalMonth,
                      )}
                    </FieldDescription>
                    <FieldError
                      errors={[
                        ...getClientFieldErrors(formField.state.meta.errors).map((m) => ({ message: m })),
                        ...getFieldError("feeRenewalMonth").map((m) => ({ message: m })),
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
                    (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                    (formField.state.meta.errors.length > 0 || getFieldError("feeRenewalDay").length > 0)
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
                        ...getClientFieldErrors(formField.state.meta.errors).map((m) => ({ message: m })),
                        ...getFieldError("feeRenewalDay").map((m) => ({ message: m })),
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
                    (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                    (formField.state.meta.errors.length > 0 || getFieldError("feeAmount").length > 0)
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
                          ? String(orgFeeDefaults.feeAmount)
                          : ""
                      }
                    />
                    <FieldDescription>
                      {formatOrgDefault(
                        orgFeeDefaults?.feeAmount != null
                          ? `${orgFeeDefaults.feeAmount} ${orgFeeDefaults.feeCurrency}`
                          : "",
                        orgFeeDefaults?.feeAmount,
                      )}
                    </FieldDescription>
                    <FieldError
                      errors={[
                        ...getClientFieldErrors(formField.state.meta.errors).map((m) => ({ message: m })),
                        ...getFieldError("feeAmount").map((m) => ({ message: m })),
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
                      onValueChange={(v) =>
                        formField.handleChange(v || null)
                      }
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

          <form.Field name="feeBankAccount">
            {(formField) => (
              <Field
                data-invalid={
                  (formField.state.meta.isTouched || form.state.submissionAttempts > 0) &&
                  (formField.state.meta.errors.length > 0 || getFieldError("feeBankAccount").length > 0)
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
                      orgFeeDefaults?.feeBankAccount ?? "CZ6508000000192000145399"
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
                      ...getClientFieldErrors(formField.state.meta.errors).map((m) => ({ message: m })),
                      ...getFieldError("feeBankAccount").map((m) => ({ message: m })),
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
            : submitLabel ?? (group?.id ? "Save group" : "Create group")}
        </Button>
      </div>
    </form>
  );
}
