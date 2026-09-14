"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { EventRsvpControl } from "@/components/app/events/event-rsvp-control";
import { AfterRsvpFormDialog } from "@/components/app/forms/after-rsvp-form-dialog";
import type { PortalFillerData } from "@/components/app/forms/portal-form-filler";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
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
  afterRsvpForm,
}: {
  eventId: string;
  open: RsvpOpenResult;
  maxGuests: number;
  current: { answer: EventRsvpAnswer; guestCount: number; standing: EventRsvpStanding } | null;
  /** The pending `after_rsvp` form, or null when there is none / it is done. */
  afterRsvpForm: (PortalFillerData & { required: boolean }) | null;
}) {
  const router = useRouter();
  const respond = useAction(respondToEventAction);
  const [refreshing, startRefresh] = useTransition();
  const [justAnswered, setJustAnswered] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(
    () => current != null && afterRsvpForm != null && afterRsvpForm.required && afterRsvpForm.canSubmit.ok,
  );

  // Open once the refreshed props (with the new RSVP) have landed, so the
  // dialog never flashes "answer the invitation first".
  useEffect(() => {
    if (justAnswered && !refreshing && afterRsvpForm?.canSubmit.ok) {
      setDialogOpen(true);
      setJustAnswered(false);
    }
  }, [justAnswered, refreshing, afterRsvpForm]);

  return (
    <>
      <EventRsvpControl
        open={open}
        maxGuests={maxGuests}
        current={current}
        onSubmit={async (input) => {
          const result = await respond.executeAsync({ eventId, ...input });
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
        />
      ) : null}
    </>
  );
}
