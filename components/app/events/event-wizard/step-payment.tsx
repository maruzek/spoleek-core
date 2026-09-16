"use client";

import { DateTimeField } from "@/components/app/date-time-field";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatBankAccount } from "@/lib/iban";

import type { EventDraft, FieldErrors, PaymentDefaults } from "./types";

export function StepPayment({
  draft,
  errors,
  defaults,
  onChange,
}: {
  draft: EventDraft;
  errors: FieldErrors;
  defaults: PaymentDefaults;
  onChange: (patch: Partial<EventDraft>) => void;
}) {
  const err = (k: keyof EventDraft) => (errors[k] ?? []).map((message) => ({ message }));
  const defaultAccount = defaults.bankAccount ? formatBankAccount(defaults.bankAccount).primary : null;
  const derivedDue = draft.rsvpDeadlineAt ?? draft.startsAt ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold">Payment</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A confirmed “yes” creates a payment with a variable symbol and QR code, for members and guests
          alike. Reserve-list places are not charged until confirmed.
        </p>
      </div>

      <FieldGroup>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="ew-paid">Paid event</FieldLabel>
            <FieldDescription>One price per person; guests pay the same.</FieldDescription>
          </FieldContent>
          <Switch
            id="ew-paid"
            checked={draft.paid}
            onCheckedChange={(paid) =>
              onChange({
                paid,
                // First switch-on: start from the organization's currency.
                ...(paid && !draft.priceCurrency ? { priceCurrency: defaults.currency } : {}),
              })
            }
          />
        </Field>

        {draft.paid ? (
          <>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_8rem]">
              <Field data-invalid={err("priceAmount").length > 0}>
                <FieldLabel htmlFor="ew-price">Price per person</FieldLabel>
                <FieldContent>
                  <Input
                    id="ew-price"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="350"
                    value={draft.priceAmount ?? ""}
                    onChange={(e) =>
                      onChange({ priceAmount: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                  <FieldError errors={err("priceAmount")} />
                </FieldContent>
              </Field>
              <Field data-invalid={err("priceCurrency").length > 0}>
                <FieldLabel htmlFor="ew-currency">Currency</FieldLabel>
                <FieldContent>
                  <Input
                    id="ew-currency"
                    maxLength={3}
                    className="uppercase"
                    placeholder={defaults.currency}
                    value={draft.priceCurrency ?? ""}
                    onChange={(e) => onChange({ priceCurrency: e.target.value.toUpperCase() || null })}
                  />
                  <FieldError errors={err("priceCurrency")} />
                </FieldContent>
              </Field>
            </div>

            <Field data-invalid={err("priceBankAccount").length > 0}>
              <FieldLabel htmlFor="ew-bank">Bank account</FieldLabel>
              <FieldContent>
                <Input
                  id="ew-bank"
                  placeholder={defaultAccount ?? "IBAN"}
                  value={draft.priceBankAccount ?? ""}
                  onChange={(e) => onChange({ priceBankAccount: e.target.value || null })}
                />
                <FieldDescription>
                  {defaultAccount
                    ? `Empty means the organization's fee account (${defaultAccount}).`
                    : "The organization has no fee account yet, so a priced event needs one here before it can be published."}
                </FieldDescription>
                <FieldError errors={err("priceBankAccount")} />
              </FieldContent>
            </Field>

            <Field data-invalid={err("paymentDueAt").length > 0}>
              <FieldLabel htmlFor="ew-due">Pay by</FieldLabel>
              <FieldContent>
                <DateTimeField
                  id="ew-due"
                  value={draft.paymentDueAt ?? null}
                  dateOnly
                  placeholder={derivedDue ? undefined : "14 days after answering"}
                  onChange={(paymentDueAt) => onChange({ paymentDueAt })}
                />
                <FieldDescription>
                  {draft.rsvpDeadlineAt
                    ? "Empty means the RSVP deadline."
                    : draft.startsAt
                      ? "Empty means the start of the event."
                      : "Empty means 14 days after the answer."}{" "}
                  Unpaid payments turn overdue afterwards; places are never released automatically.
                </FieldDescription>
                <FieldError errors={err("paymentDueAt")} />
              </FieldContent>
            </Field>
          </>
        ) : null}
      </FieldGroup>
    </div>
  );
}
