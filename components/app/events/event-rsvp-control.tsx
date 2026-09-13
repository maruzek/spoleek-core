"use client";

import { useState } from "react";
import { CheckIcon, HelpCircleIcon, Loader2Icon, MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { useDictionary } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
import { cn } from "@/lib/utils";
import type { EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

export type RsvpSubmit = (input: { answer: EventRsvpAnswer; guestCount: number }) => Promise<
  { ok: true; standing: EventRsvpStanding } | { ok: false; error: string }
>;

const ANSWERS: { value: EventRsvpAnswer; icon: typeof CheckIcon }[] = [
  { value: "yes", icon: CheckIcon },
  { value: "maybe", icon: HelpCircleIcon },
  { value: "no", icon: XIcon },
];

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

      <div role="radiogroup" aria-label={t.yourAnswer} className="grid grid-cols-3 gap-2">
        {ANSWERS.map(({ value, icon: Icon }) => {
          const selected = answer === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setAnswer(value)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected
                  ? value === "yes"
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-foreground bg-foreground text-background shadow-xs"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t.answer[value]}
            </button>
          );
        })}
      </div>

      {maxGuests > 0 && answer === "yes" ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{t.detail.guestsLabel}</span>
            <span className="text-xs text-muted-foreground">{t.detail.party(1 + guestCount)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={t.detail.fewer}
              disabled={guestCount === 0}
              onClick={() => setGuestCount((n) => Math.max(0, n - 1))}
            >
              <MinusIcon />
            </Button>
            <span className="w-8 text-center font-heading text-xl tabular-nums" aria-live="polite">
              {guestCount}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={t.detail.more}
              disabled={guestCount >= maxGuests}
              onClick={() => setGuestCount((n) => Math.min(maxGuests, n + 1))}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>
      ) : null}

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
