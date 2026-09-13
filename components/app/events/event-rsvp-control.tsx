"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { AnswerTiles, GuestStepper } from "@/components/app/events/event-rsvp-parts";
import { useDictionary } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
import { cn } from "@/lib/utils";
import type { EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

export type RsvpSubmit = (input: { answer: EventRsvpAnswer; guestCount: number }) => Promise<
  { ok: true; standing: EventRsvpStanding } | { ok: false; error: string }
>;

/**
 * Yes / maybe / no as three large buttons, plus a guest stepper for a yes.
 * Bound to whichever action the surface uses (portal member, token holder)
 * through `onSubmit`, so the control itself knows nothing about identity.
 */
export function EventRsvpControl({
  open,
  maxGuests,
  current,
  onSubmit,
}: {
  open: RsvpOpenResult;
  maxGuests: number;
  current: { answer: EventRsvpAnswer; guestCount: number; standing: EventRsvpStanding } | null;
  onSubmit: RsvpSubmit;
}) {
  const t = useDictionary().events;
  const [answer, setAnswer] = useState<EventRsvpAnswer | null>(current?.answer ?? null);
  const [guestCount, setGuestCount] = useState(current?.guestCount ?? 0);
  const [standing, setStanding] = useState<EventRsvpStanding | null>(current?.standing ?? null);
  const [pending, setPending] = useState(false);

  const dirty = answer !== (current?.answer ?? null) || guestCount !== (current?.guestCount ?? 0);

  if (!open.open) {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-dashed p-4 text-sm">
        <p className="text-muted-foreground">{t.closed[open.reason]}</p>
        {current ? (
          <p className="font-medium text-foreground">
            {t.yourAnswer}: {t.answer[current.answer]}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!answer) return;
        setPending(true);
        const result = await onSubmit({ answer, guestCount: answer === "yes" ? guestCount : 0 });
        setPending(false);
        if (result.ok) {
          setStanding(result.standing);
          toast.success(t.saved);
        } else {
          const code = result.error as keyof typeof t.errors;
          toast.error(t.errors[code] ?? t.errors.generic);
        }
      }}
    >
      <div className="flex flex-col gap-1">
        <p className="font-heading text-lg text-foreground">{t.detail.answerPrompt}</p>
        <p className="text-xs text-muted-foreground">{t.detail.answerHint}</p>
      </div>

      <AnswerTiles value={answer} onChange={setAnswer} />

      {maxGuests > 0 && answer === "yes" ? <GuestStepper value={guestCount} max={maxGuests} onChange={setGuestCount} /> : null}

      {answer === "yes" && standing && !dirty ? (
        <p
          className={cn(
            "text-sm",
            standing === "confirmed" ? "text-primary" : "text-amber-700 dark:text-amber-400",
          )}
        >
          {t.standing[standing]}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={!answer || !dirty || pending} className="w-full">
        {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
        {t.submit}
      </Button>
    </form>
  );
}
