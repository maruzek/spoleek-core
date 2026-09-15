"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { EventRsvpControl } from "@/components/app/events/event-rsvp-control";
import { AfterRsvpFormDialog } from "@/components/app/forms/after-rsvp-form-dialog";
import { PublicFormFiller, type PublicFillerData } from "@/components/app/forms/public-form-filler";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
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
  afterRsvpForm,
}: {
  token: string;
  open: RsvpOpenResult;
  maxGuests: number;
  current: { answer: EventRsvpAnswer; guestCount: number; standing: EventRsvpStanding } | null;
  afterRsvpForm: (PublicFillerData & { required: boolean }) | null;
}) {
  const router = useRouter();
  const respond = useAction(respondWithTokenAction);
  const [refreshing, startRefresh] = useTransition();
  const [justAnswered, setJustAnswered] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(
    () => current != null && afterRsvpForm != null && afterRsvpForm.required && afterRsvpForm.canSubmit.ok,
  );

  if (justAnswered && !refreshing && afterRsvpForm?.canSubmit.ok) {
    setJustAnswered(false);
    setDialogOpen(true);
  }

  return (
    <>
      <EventRsvpControl
        open={open}
        maxGuests={maxGuests}
        current={current}
        onSubmit={async (input) => {
          const result = await respond.executeAsync({ token, ...input });
          if (result?.data?.success) {
            startRefresh(() => router.refresh());
            if (afterRsvpForm) setJustAnswered(true);
            return { ok: true, standing: result.data.standing };
          }
          return { ok: false, error: result?.serverError ?? "generic" };
        }}
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
