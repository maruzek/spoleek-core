"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { feeToMajorUnits, feeToMinorUnits } from "@/lib/payments";
import {
  feeCurrencyOptions,
  membershipManagementModeOptions,
} from "@/lib/membership";
import {
  describeMembershipPeriod,
  getFeeDueDate,
  membershipPeriodModeOptions,
  resolveMembershipPeriod,
} from "@/lib/membership-period";
import type {
  MembershipManagementMode,
  MembershipPeriodMode,
} from "@/server/db/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  membershipPeriodMode: MembershipPeriodMode;
  membershipReportEnabled: boolean;
  membershipReportAllowSelfApproval: boolean;
};

export function MembershipSettingsCard({
  state,
  locale,
  feeManagingCategoryName,
}: {
  state: MembershipSettingsState;
  /** Formats the period summary sentence in the organization's language. */
  locale: string;
  /**
   * Name of the group category flagged `managesMembershipFees`, or null when
   * none is. The yearly report reports one row per group in that category, so
   * without it there is nothing to switch on.
   */
  feeManagingCategoryName: string | null;
}) {
  const router = useRouter();

  const [mode, setMode] = useState(state.membershipManagementMode);
  const [renewalMonthValue, setRenewalMonthValue] = useState(
    state.membershipRenewalMonth ?? 1,
  );
  // Held as text, not a number. A number input round-trips "" through
  // Number("") === 0 and stamps a 0 into the field the moment the admin clears
  // it to type a new value, which is why the old field showed "020".
  const [renewalDayText, setRenewalDayText] = useState(
    String(state.membershipRenewalDay ?? 1),
  );
  const [feeEnabled, setFeeEnabled] = useState(state.membershipFeeEnabled);
  const [feeAmount, setFeeAmount] = useState(
    feeToMajorUnits(state.membershipFeeAmount) ?? 0,
  );
  const [feeCurrency, setFeeCurrency] = useState(state.membershipFeeCurrency);
  const [bankAccount, setBankAccount] = useState(
    state.membershipFeeBankAccount ?? "",
  );
  const [paymentWindowDays, setPaymentWindowDays] = useState(
    state.membershipFeePaymentWindowDays ?? 30,
  );
  const [periodMode, setPeriodMode] = useState(state.membershipPeriodMode);

  // A calendar year fixes the renewal date at 1 January; nothing else is
  // consistent with a period that is defined as Jan–Dec.
  const isCalendarYear = periodMode === "calendar_year";
  const renewalMonth = isCalendarYear ? 1 : renewalMonthValue;
  const renewalDay = isCalendarYear
    ? 1
    : Math.min(Math.max(Number(renewalDayText) || 1, 1), 31);
  const [reportEnabled, setReportEnabled] = useState(
    state.membershipReportEnabled,
  );
  const [allowSelfApproval, setAllowSelfApproval] = useState(
    state.membershipReportAllowSelfApproval,
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

  // Stated back to the admin rather than left to be inferred from a month
  // dropdown and a day input. Recomputed from the unsaved form values so the
  // sentence tracks what they are about to save, not what is stored.
  const periodSummary = useMemo(() => {
    const period = resolveMembershipPeriod({
      mode: periodMode,
      renewalMonth,
      renewalDay,
      today: new Date(),
    });

    return describeMembershipPeriod({
      period,
      feeDueAt: feeEnabled
        ? getFeeDueDate(period.start, paymentWindowDays)
        : null,
      locale,
    });
  }, [periodMode, renewalMonth, renewalDay, feeEnabled, paymentWindowDays, locale]);

  const canEnableReport = isPeriodicRenewal && feeEnabled;

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
          <Field>
            <FieldLabel htmlFor="membership-period-mode">
              Membership period
            </FieldLabel>
            <FieldContent>
              <Select
                value={periodMode}
                onValueChange={(v) => setPeriodMode(v as MembershipPeriodMode)}
              >
                <SelectTrigger id="membership-period-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {membershipPeriodModeOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled={!option.available}
                    >
                      {option.label}
                      {option.available ? "" : " (coming soon)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {
                  membershipPeriodModeOptions.find(
                    (option) => option.value === periodMode,
                  )?.description
                }
              </FieldDescription>
            </FieldContent>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="renewal-month">Renewal month</FieldLabel>
              <FieldContent>
                <Select
                  value={String(renewalMonth)}
                  onValueChange={(v) => setRenewalMonthValue(Number(v))}
                  disabled={isCalendarYear}
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
                  {isCalendarYear
                    ? "Fixed to 1 January by the calendar year period."
                    : "The month in which memberships renew."}
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="renewal-day">Renewal day</FieldLabel>
              <FieldContent>
                <Input
                  id="renewal-day"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={2}
                  value={isCalendarYear ? "1" : renewalDayText}
                  disabled={isCalendarYear}
                  onChange={(e) => {
                    // Digits only, and an empty field stays empty — the value
                    // is clamped into range when it is read, not while typing.
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                    if (Number(digits) > 31) return;
                    setRenewalDayText(digits);
                  }}
                  onBlur={() => setRenewalDayText(String(renewalDay))}
                />
                <FieldDescription>
                  {isCalendarYear
                    ? "Fixed to the 1st by the calendar year period."
                    : "The day of the month (1–31)."}
                </FieldDescription>
              </FieldContent>
            </Field>
          </div>

          <Alert>
            <AlertDescription>{periodSummary}</AlertDescription>
          </Alert>

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

          <div className="flex flex-col gap-3 border-t pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Yearly member report
            </p>

            <SwitchChoiceField
              id="membership-report-enabled"
              title="Enable the yearly member report"
              description={
                feeManagingCategoryName
                  ? `Groups in ${feeManagingCategoryName} confirm and lock their paid members each year, and the board reviews and approves each one. Adds Reports to the navigation.`
                  : "Groups confirm and lock their paid members each year, and the board reviews and approves each one. Adds Reports to the navigation."
              }
              checked={reportEnabled && canEnableReport}
              onCheckedChange={setReportEnabled}
              disabled={!canEnableReport || !feeManagingCategoryName}
            />

            {!canEnableReport ? (
              <Alert>
                <AlertDescription>
                  The report counts members who paid their fee, so it needs
                  periodic renewal with fee payment turned on.
                </AlertDescription>
              </Alert>
            ) : !feeManagingCategoryName ? (
              <Alert>
                <AlertDescription>
                  No group category manages membership fees yet. The report has
                  one row per group in that category — turn on &ldquo;Manages
                  membership fees&rdquo; for the category your regions live in.
                </AlertDescription>
              </Alert>
            ) : null}

            {reportEnabled && canEnableReport && feeManagingCategoryName ? (
              <SwitchChoiceField
                id="membership-report-self-approval"
                title="Allow self-approval"
                description="Off means an org admin cannot approve a group report they submitted themselves. Turn it on for a small organization where the same person runs a region and sits on the board — the approval is still recorded and shown as self-approved."
                checked={allowSelfApproval}
                onCheckedChange={setAllowSelfApproval}
              />
            ) : null}
          </div>
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
                isPeriodicRenewal && feeEnabled
                  ? feeToMinorUnits(feeAmount)
                  : null,
              membershipFeeCurrency: feeCurrency,
              membershipFeeBankAccount:
                isPeriodicRenewal && feeEnabled && bankAccount.trim()
                  ? bankAccount.trim()
                  : null,
              membershipFeePaymentWindowDays: paymentWindowDays,
              membershipPeriodMode: periodMode,
              membershipReportEnabled:
                canEnableReport && Boolean(feeManagingCategoryName)
                  ? reportEnabled
                  : false,
              membershipReportAllowSelfApproval: allowSelfApproval,
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
