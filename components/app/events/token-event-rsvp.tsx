"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { EventPaymentCard } from "@/components/app/events/event-payment-card";
import { EventRsvpControl } from "@/components/app/events/event-rsvp-control";
import { AfterRsvpFormDialog } from "@/components/app/forms/after-rsvp-form-dialog";
import { PublicFormFiller, type PublicFillerData } from "@/components/app/forms/public-form-filler";
import type { EventPaymentView } from "@/lib/events/payment-plan";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
import type { Dictionary } from "@/lib/i18n/messages";
import { respondWithTokenAction } from "@/server/actions/events";
import type { EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

/**
 * Binds the RSVP control to a token link and prompts for the `after_rsvp`
 * form the way the portal does: right after the answer, and on every load
 * while a required one is pending.
 */
export function TokenEventRsvp({
  token,
  open,
  maxGuests,
  current,
  payment,
  priced,
  eventTitle,
  payerName,
  paymentLabels,
  afterRsvpForm,
}: {
  token: string;
  open: RsvpOpenResult;
  maxGuests: number;
  current: { answer: EventRsvpAnswer; guestCount: number; standing: EventRsvpStanding } | null;
  /** The live payment for the current answer, when the event charges. */
  payment: EventPaymentView | null;
  priced: boolean;
  eventTitle: string;
  payerName?: string;
  paymentLabels: Dictionary["events"]["detail"]["payment"];
  afterRsvpForm: (PublicFillerData & { required: boolean }) | null;
}) {
  const router = useRouter();
  const respond = useAction(respondWithTokenAction);
  const [refreshing, startRefresh] = useTransition();
  const [justAnswered, setJustAnswered] = useState(false);
  // The action returns the payment so the card appears without waiting for
  // the refresh; the server prop takes over on the next render.
  const [livePayment, setLivePayment] = useState(payment);
  const [lastServerPayment, setLastServerPayment] = useState(payment);
  if (payment !== lastServerPayment) {
    setLastServerPayment(payment);
    setLivePayment(payment);
  }
  const [answered, setAnswered] = useState(current);
  const [lastServerCurrent, setLastServerCurrent] = useState(current);
  if (current !== lastServerCurrent) {
    setLastServerCurrent(current);
    setAnswered(current);
  }
  const [dialogOpen, setDialogOpen] = useState(
    () => current != null && afterRsvpForm != null && afterRsvpForm.required && afterRsvpForm.canSubmit.ok,
  );

  if (justAnswered && !refreshing && afterRsvpForm?.canSubmit.ok) {
    setJustAnswered(false);
    setDialogOpen(true);
  }

  return (
    <>
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <EventRsvpControl
          open={open}
          maxGuests={maxGuests}
          current={current}
          onSubmit={async (input) => {
            const result = await respond.executeAsync({ token, ...input });
            if (result?.data?.success) {
              setLivePayment(result.data.payment);
              setAnswered({ ...input, standing: result.data.standing });
              startRefresh(() => router.refresh());
              if (afterRsvpForm) setJustAnswered(true);
              return { ok: true, standing: result.data.standing };
            }
            return { ok: false, error: result?.serverError ?? "generic" };
          }}
        />
      </div>
      <EventPaymentCard
        payment={livePayment}
        current={answered}
        priced={priced}
        eventTitle={eventTitle}
        payerName={payerName}
        t={paymentLabels}
      />
      {afterRsvpForm ? (
        <AfterRsvpFormDialog
          open={dialogOpen}
          data={afterRsvpForm}
          required={afterRsvpForm.required}
          onOpenChange={setDialogOpen}
          filler={(onSubmitted) => (
            <PublicFormFiller data={afterRsvpForm} source={{ kind: "token", token }} compact onSubmitted={onSubmitted} />
          )}
        />
      ) : null}
    </>
  );
}
