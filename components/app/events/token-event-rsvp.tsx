"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { EventRsvpControl } from "@/components/app/events/event-rsvp-control";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
import { respondWithTokenAction } from "@/server/actions/events";
import type { EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

/** Binds the RSVP control to a token link. */
export function TokenEventRsvp({
  token,
  open,
  maxGuests,
  current,
}: {
  token: string;
  open: RsvpOpenResult;
  maxGuests: number;
  current: { answer: EventRsvpAnswer; guestCount: number; standing: EventRsvpStanding } | null;
}) {
  const router = useRouter();
  const respond = useAction(respondWithTokenAction);

  return (
    <EventRsvpControl
      open={open}
      maxGuests={maxGuests}
      current={current}
      onSubmit={async (input) => {
        const result = await respond.executeAsync({ token, ...input });
        if (result?.data?.success) {
          router.refresh();
          return { ok: true, standing: result.data.standing };
        }
        return { ok: false, error: result?.serverError ?? "generic" };
      }}
    />
  );
}
