"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { useDictionary } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
import type { EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

export type RsvpSubmit = (input: { answer: EventRsvpAnswer; guestCount: number }) => Promise<
  { ok: true; standing: EventRsvpStanding } | { ok: false; error: string }
>;

/**
 * Yes / no / maybe with an optional guest stepper. Bound to whichever action
 * the surface uses (portal member, token holder) through `onSubmit`, so the
 * control itself knows nothing about identity.
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
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        {t.closed[open.reason]}
        {current ? (
          <p className="mt-1 text-foreground">
            {t.yourAnswer}: {t.answer[current.answer]}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border p-4"
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
      <Field>
        <FieldLabel>{t.yourAnswer}</FieldLabel>
        <FieldContent>
          <ToggleGroup
            type="single"
            variant="outline"
            value={answer ?? ""}
            onValueChange={(value: string) => {
              if (value) setAnswer(value as EventRsvpAnswer);
            }}
            aria-label={t.yourAnswer}
          >
            {(["yes", "maybe", "no"] as const).map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {t.answer[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldContent>
      </Field>

      {maxGuests > 0 && answer === "yes" ? (
        <Field>
          <FieldLabel htmlFor="rsvp-guests">{t.guests}</FieldLabel>
          <FieldContent>
            <Input
              id="rsvp-guests"
              type="number"
              min={0}
              max={maxGuests}
              className="w-24"
              value={guestCount}
              onChange={(e) => setGuestCount(Math.max(0, Math.min(maxGuests, Number(e.target.value) || 0)))}
            />
            <FieldDescription>{t.guestsHint(maxGuests)}</FieldDescription>
          </FieldContent>
        </Field>
      ) : null}

      {answer === "yes" && standing && !dirty ? (
        <p className={standing === "confirmed" ? "text-sm" : "text-sm text-amber-700 dark:text-amber-400"}>
          {t.standing[standing]}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={!answer || !dirty || pending}>
          {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
