"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { EventPaymentCard } from "@/components/app/events/event-payment-card";
import { EventRsvpControl } from "@/components/app/events/event-rsvp-control";
import { AfterRsvpFormDialog } from "@/components/app/forms/after-rsvp-form-dialog";
import { PortalFormFiller } from "@/components/app/forms/portal-form-filler";
import { PublicFormFiller } from "@/components/app/forms/public-form-filler";
import { useDictionary } from "@/components/locale-provider";
import type { RsvpView } from "@/lib/events/responder";
import { respondToEventAction, respondWithTokenAction } from "@/server/actions/events";

/**
 * Which respond action the control is bound to. The member answers through
 * their session; a link holder through the token, which also picks the
 * signed-out filler for the after-RSVP form.
 */
export type RsvpTarget = { kind: "member"; eventId: string } | { kind: "token"; token: string };

/**
 * The RSVP control for an identified responder (member or link holder):
 * answer → payment card → and, when the event has an `after_rsvp` form they
 * have not filled in, a dialog the moment the answer is saved — a required
 * one every time the page loads until it is done.
 */
export function EventRsvp({ target, view }: { target: RsvpTarget; view: RsvpView }) {
  const { current, payment, afterRsvpForm } = view;
  const t = useDictionary().events;
  const router = useRouter();
  const respondAsMember = useAction(respondToEventAction);
  const respondWithToken = useAction(respondWithTokenAction);
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

  const respond = (input: { answer: NonNullable<typeof current>["answer"]; guestCount: number }) =>
    target.kind === "member"
      ? respondAsMember.executeAsync({ eventId: target.eventId, ...input })
      : respondWithToken.executeAsync({ token: target.token, ...input });

  return (
    <>
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <EventRsvpControl
          open={view.open}
          maxGuests={view.maxGuests}
          current={current}
          onSubmit={async (input) => {
            const result = await respond(input);
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
        priced={view.priced}
        eventTitle={view.eventTitle}
        payerName={view.payerName ?? undefined}
        t={t.detail.payment}
      />
      {afterRsvpForm ? (
        <AfterRsvpFormDialog
          open={dialogOpen}
          data={afterRsvpForm}
          required={afterRsvpForm.required}
          onOpenChange={setDialogOpen}
          filler={(onSubmitted) =>
            target.kind === "member" ? (
              <PortalFormFiller data={afterRsvpForm} compact onSubmitted={onSubmitted} />
            ) : (
              <PublicFormFiller
                data={afterRsvpForm}
                source={{ kind: "token", token: target.token }}
                compact
                onSubmitted={onSubmitted}
              />
            )
          }
        />
      ) : null}
    </>
  );
}
