"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { EventPaymentCard } from "@/components/app/events/event-payment-card";
import { EventRsvpControl } from "@/components/app/events/event-rsvp-control";
import { AfterRsvpFormDialog } from "@/components/app/forms/after-rsvp-form-dialog";
import { PortalFormFiller, type PortalFillerData } from "@/components/app/forms/portal-form-filler";
import type { EventPaymentView } from "@/lib/events/payment-plan";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
import type { Dictionary } from "@/lib/i18n/messages";
import { respondToEventAction } from "@/server/actions/events";
import type { EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

/**
 * Binds the RSVP control to the signed-in member's action and, when the
 * event has an `after_rsvp` form the member has not filled in, opens it in
 * a dialog the moment the answer is saved — a required one every time the
 * page loads until it is done.
 */
export function PortalEventRsvp({
  eventId,
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
  eventId: string;
  open: RsvpOpenResult;
  maxGuests: number;
  current: { answer: EventRsvpAnswer; guestCount: number; standing: EventRsvpStanding } | null;
  /** The live payment for the current answer, when the event charges. */
  payment: EventPaymentView | null;
  priced: boolean;
  eventTitle: string;
  payerName?: string;
  paymentLabels: Dictionary["events"]["detail"]["payment"];
  /** The pending `after_rsvp` form, or null when there is none / it is done. */
  afterRsvpForm: (PortalFillerData & { required: boolean }) | null;
}) {
  const router = useRouter();
  const respond = useAction(respondToEventAction);
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

  // Open once the refreshed props (with the new RSVP) have landed, so the
  // dialog never flashes "answer the invitation first". Adjusted during
  // render rather than in an effect, as the wizard resets on reopen.
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
            const result = await respond.executeAsync({ eventId, ...input });
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
          filler={(onSubmitted) => <PortalFormFiller data={afterRsvpForm} compact onSubmitted={onSubmitted} />}
        />
      ) : null}
    </>
  );
}
