"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import {
  feeCurrencyOptions,
  membershipManagementModeOptions,
} from "@/lib/membership";
import type { MembershipManagementMode } from "@/server/db/schema";
import { SwitchChoiceField } from "@/components/app/switch-choice-field";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveMembershipSettingsAction } from "@/server/actions/organization-settings";

export type MembershipSettingsState = {
  membershipManagementMode: MembershipManagementMode;
  membershipRenewalMonth: number | null;
  membershipRenewalDay: number | null;
  membershipFeeEnabled: boolean;
  membershipFeeAmount: number | null;
  membershipFeeCurrency: string;
  membershipFeeBankAccount: string | null;
};

export function MembershipSettingsCard({
  state,
}: {
  state: MembershipSettingsState;
}) {
  const router = useRouter();

  const [mode, setMode] = useState(state.membershipManagementMode);
  const [renewalMonth, setRenewalMonth] = useState(
    state.membershipRenewalMonth ?? 1,
  );
  const [renewalDay, setRenewalDay] = useState(
    state.membershipRenewalDay ?? 1,
  );
  const [feeEnabled, setFeeEnabled] = useState(state.membershipFeeEnabled);
  const [feeAmount, setFeeAmount] = useState(state.membershipFeeAmount ?? 0);
  const [feeCurrency, setFeeCurrency] = useState(state.membershipFeeCurrency);
  const [bankAccount, setBankAccount] = useState(
    state.membershipFeeBankAccount ?? "",
  );

  const saveAction = useAction(saveMembershipSettingsAction, {
    onSuccess() {
      toast.success("Membership settings saved.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save membership settings.");
    },
  });

  const isPeriodicRenewal = mode === "periodic_renewal";

  return (
    <div className="flex flex-col gap-6 rounded-3xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">
          Membership management
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Choose how memberships are managed across your organization. When
          periodic renewal is active, members must confirm their membership each
          year. You can optionally require a fee payment.
        </p>
      </div>

      <FieldSet>
        <FieldLegend>Membership mode</FieldLegend>
        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as MembershipManagementMode)}
          className="max-w-2xl"
        >
          {membershipManagementModeOptions.map((option) => {
            const id = `membership-mode-${option.value}`;
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

      {isPeriodicRenewal ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="renewal-month">Renewal month</FieldLabel>
              <FieldContent>
                <Select
                  value={String(renewalMonth)}
                  onValueChange={(v) => setRenewalMonth(Number(v))}
                >
                  <SelectTrigger id="renewal-month">
                    <SelectValue />
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
                  The month until which memberships are valid.
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="renewal-day">Renewal day</FieldLabel>
              <FieldContent>
                <Input
                  id="renewal-day"
                  type="number"
                  min={1}
                  max={31}
                  value={renewalDay}
                  onChange={(e) => setRenewalDay(Number(e.target.value))}
                />
                <FieldDescription>
                  The day of the month (1–31).
                </FieldDescription>
              </FieldContent>
            </Field>
          </div>

          <SwitchChoiceField
            id="membership-fee-enabled"
            title="Require fee payment"
            description="When off, members only need to click confirm. When on, a fee payment is also expected."
            checked={feeEnabled}
            onCheckedChange={setFeeEnabled}
          />

          {feeEnabled ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="fee-amount">Fee amount</FieldLabel>
                <FieldContent>
                  <Input
                    id="fee-amount"
                    type="number"
                    min={0}
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(Number(e.target.value))}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="fee-currency">Currency</FieldLabel>
                <FieldContent>
                  <Select value={feeCurrency} onValueChange={setFeeCurrency}>
                    <SelectTrigger id="fee-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {feeCurrencyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="fee-bank-account">
                  Bank account (IBAN)
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="fee-bank-account"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="CZ6508000000192000145399"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FieldContent>
              </Field>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        <Button
          type="button"
          onClick={() =>
            saveAction.execute({
              membershipManagementMode: mode,
              membershipRenewalMonth: isPeriodicRenewal ? renewalMonth : null,
              membershipRenewalDay: isPeriodicRenewal ? renewalDay : null,
              membershipFeeEnabled: isPeriodicRenewal ? feeEnabled : false,
              membershipFeeAmount:
                isPeriodicRenewal && feeEnabled ? feeAmount : null,
              membershipFeeCurrency: feeCurrency,
              membershipFeeBankAccount:
                isPeriodicRenewal && feeEnabled && bankAccount.trim()
                  ? bankAccount.trim()
                  : null,
            })
          }
          disabled={saveAction.isPending}
        >
          {saveAction.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
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
