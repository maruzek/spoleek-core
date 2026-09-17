"use client";

import { CheckIcon, HelpCircleIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";

import { useDictionary } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventRsvpAnswer } from "@/server/db/schema";

const ANSWERS: { value: EventRsvpAnswer; icon: typeof CheckIcon }[] = [
  { value: "yes", icon: CheckIcon },
  { value: "maybe", icon: HelpCircleIcon },
  { value: "no", icon: XIcon },
];

/** Selected tile takes the answer's colour: green, amber, red. */
const SELECTED_CLASS: Record<EventRsvpAnswer, string> = {
  yes: "border-primary bg-primary text-primary-foreground shadow-xs",
  maybe: "border-amber-500 bg-amber-500 text-white shadow-xs",
  no: "border-destructive bg-destructive text-white shadow-xs",
};

/** Three large answer tiles, each lit in its own colour when chosen. */
export function AnswerTiles({
  value,
  onChange,
}: {
  value: EventRsvpAnswer | null;
  onChange: (answer: EventRsvpAnswer) => void;
}) {
  const t = useDictionary().events;
  return (
    <div role="radiogroup" aria-label={t.yourAnswer} className="grid grid-cols-3 gap-2">
      {ANSWERS.map(({ value: answer, icon: Icon }) => {
        const selected = value === answer;
        return (
          <button
            key={answer}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(answer)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected
                ? SELECTED_CLASS[answer]
                : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t.answer[answer]}
          </button>
        );
      })}
    </div>
  );
}

/** −/+ stepper for guests, with "Just you / You + n" under the label. */
export function GuestStepper({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const t = useDictionary().events;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{t.detail.guestsLabel}</span>
        <span className="text-xs text-muted-foreground">{t.detail.party(1 + value)}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label={t.detail.fewer}
          disabled={value === 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <MinusIcon />
        </Button>
        <span className="w-8 text-center font-heading text-xl tabular-nums" aria-live="polite">
          {value}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label={t.detail.more}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  );
}
