"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { EventRsvpControl } from "@/components/app/events/event-rsvp-control";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
import { respondToEventAction } from "@/server/actions/events";
import type { EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

/** Binds the RSVP control to the signed-in member's action. */
export function PortalEventRsvp({
  eventId,
  open,
  maxGuests,
  current,
}: {
  eventId: string;
  open: RsvpOpenResult;
  maxGuests: number;
  current: { answer: EventRsvpAnswer; guestCount: number; standing: EventRsvpStanding } | null;
}) {
  const router = useRouter();
  const respond = useAction(respondToEventAction);

  return (
    <EventRsvpControl
      open={open}
      maxGuests={maxGuests}
      current={current}
      onSubmit={async (input) => {
        const result = await respond.executeAsync({ eventId, ...input });
        if (result?.data?.success) {
          router.refresh();
          return { ok: true, standing: result.data.standing };
        }
        return { ok: false, error: result?.serverError ?? "generic" };
      }}
    />
  );
}
