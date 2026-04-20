"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
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
  membershipFeePaymentWindowDays: number;
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
  const [feeAmount, setFeeAmount] = useState((state.membershipFeeAmount ?? 0) / 100);
  const [feeCurrency, setFeeCurrency] = useState(state.membershipFeeCurrency);
  const [bankAccount, setBankAccount] = useState(
    state.membershipFeeBankAccount ?? "",
  );
  const [paymentWindowDays, setPaymentWindowDays] = useState(
    state.membershipFeePaymentWindowDays ?? 30,
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Membership mode
        </p>
        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as MembershipManagementMode)}
          className="flex flex-col gap-3"
        >
          {membershipManagementModeOptions.map((option) => {
            const id = `membership-mode-${option.value}`;
            const isSelected = mode === option.value;
            return (
              <label
                key={option.value}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-muted/50",
                )}
              >
                <RadioGroupItem value={option.value} id={id} className="mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium leading-none">{option.label}</p>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
              </label>
            );
          })}
        </RadioGroup>
      </div>

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
            <div className="grid gap-4 sm:grid-cols-2">
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

              <Field>
                <FieldLabel htmlFor="payment-window-days">
                  Payment window (days)
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="payment-window-days"
                    type="number"
                    min={1}
                    max={365}
                    value={paymentWindowDays}
                    onChange={(e) => setPaymentWindowDays(Number(e.target.value))}
                  />
                  <FieldDescription>
                    Days from renewal date until payment is due.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </div>
          ) : null}
        </>
      ) : null}

      <div>
        <Button
          type="button"
          onClick={() =>
            saveAction.execute({
              membershipManagementMode: mode,
              membershipRenewalMonth: isPeriodicRenewal ? renewalMonth : null,
              membershipRenewalDay: isPeriodicRenewal ? renewalDay : null,
              membershipFeeEnabled: isPeriodicRenewal ? feeEnabled : false,
              membershipFeeAmount:
                isPeriodicRenewal && feeEnabled ? Math.round(feeAmount * 100) : null,
              membershipFeeCurrency: feeCurrency,
              membershipFeeBankAccount:
                isPeriodicRenewal && feeEnabled && bankAccount.trim()
                  ? bankAccount.trim()
                  : null,
              membershipFeePaymentWindowDays: paymentWindowDays,
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
