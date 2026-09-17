"use client";

import { useState } from "react";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";

import { CurrencyInput } from "@/components/app/currency-input";
import { DateTimeField } from "@/components/app/date-time-field";
import { PaymentQrCard } from "@/components/app/payment-qr-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatBankAccount } from "@/lib/iban";
import { feeToMinorUnits } from "@/lib/payments";

import type { EventDraft, FieldErrors, PaymentDefaults } from "./types";

/**
 * No "paid event" switch: a price makes the event paid, an empty price makes
 * it free. `draft.paid` is derived from the amount so the action and the
 * charged-responses confirmation keep working unchanged.
 */
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
  const paid = draft.priceAmount != null;
  // Fallback due date for the preview when nothing on the draft implies one.
  const [fallbackDue] = useState(() => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
  const resolvedAccount = draft.priceBankAccount?.trim() || defaults.bankAccount;
  const derivedDue = draft.paymentDueAt ?? draft.rsvpDeadlineAt ?? draft.startsAt ?? null;
  const bankPlaceholder = defaultAccount ?? (defaults.locale === "cs" ? "123456789/0100" : "CZ65 0800 0000 1920 0014 5399");

  // What a confirmed member will see, live as the fields change.
  const preview =
    paid && draft.priceAmount != null ? (
      <PaymentQrCard
        payment={{
          id: "preview",
          status: "pending",
          amount: feeToMinorUnits(draft.priceAmount) ?? 0,
          currency: draft.priceCurrency ?? defaults.currency,
          bankAccount: resolvedAccount ?? null,
          variableSymbol: "123456",
          periodLabel: draft.title || "Event",
          dueAt: derivedDue ?? fallbackDue,
          paidAt: null,
        }}
        eventTitle={draft.title || "Event"}
        showEventTitle={false}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold">Payment</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Leave the price empty for a free event. With a price, every confirmed “yes” — members and
          guests alike — gets a payment with a variable symbol and QR code; reserve-list places are
          charged only once confirmed.
        </p>
      </div>

      {paid && !resolvedAccount ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>No bank account to pay into</AlertTitle>
          <AlertDescription>
            Enter one below, or set the organization&apos;s fee account in{" "}
            <Link href="/admin/settings" className="underline underline-offset-4">
              Settings
            </Link>
            . The event cannot be published without it.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className={paid ? "grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem]" : undefined}>
        <FieldGroup>
        <Field data-invalid={err("priceAmount").length > 0 || err("priceCurrency").length > 0}>
          <FieldLabel htmlFor="ew-price">Price per person</FieldLabel>
          <FieldContent>
            <CurrencyInput
              id="ew-price"
              amount={draft.priceAmount ?? null}
              currency={draft.priceCurrency ?? defaults.currency}
              placeholder="Free"
              invalid={err("priceAmount").length > 0}
              onAmountChange={(priceAmount) =>
                onChange({
                  priceAmount,
                  paid: priceAmount != null,
                  // First price typed: start from the organization's currency.
                  ...(priceAmount != null && !draft.priceCurrency ? { priceCurrency: defaults.currency } : {}),
                })
              }
              onCurrencyChange={(priceCurrency) => onChange({ priceCurrency })}
            />
            <FieldDescription>Guests pay the same as members.</FieldDescription>
            <FieldError errors={[...err("priceAmount"), ...err("priceCurrency")]} />
          </FieldContent>
        </Field>

        <Field data-invalid={err("priceBankAccount").length > 0}>
          <FieldLabel htmlFor="ew-bank">Bank account</FieldLabel>
          <FieldContent>
            <Input
              id="ew-bank"
              placeholder={bankPlaceholder}
              disabled={!paid}
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
              disabled={!paid}
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
      </FieldGroup>
      {preview ? (
        <div className="flex flex-col gap-2 md:pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What members see</p>
          <div className="pointer-events-none" aria-hidden>
            {preview}
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
