"use client";

import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

import type { StepGate } from "./types";

/**
 * The wizard's single forward control. Everything it renders comes from the
 * active step's `StepGate`, so there is deliberately no step-specific
 * branching here.
 */
export function WizardFooter({
  gate,
  nextLabel,
  nextIcon,
  onBack,
  backDisabled,
  onNext,
}: {
  gate: StepGate;
  nextLabel: string;
  nextIcon?: ReactNode;
  onBack: () => void;
  backDisabled: boolean;
  onNext: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reasonId = useId();

  const blocked = gate.blocked;
  const busy = !blocked && gate.busy === true;
  // Only ask about unfinished work when nothing more serious applies.
  const pending = !blocked && !busy ? gate.pending : undefined;

  const disabled = Boolean(blocked) || busy;
  const reason = blocked?.reason ?? (busy ? "Waiting for this step to finish…" : null);

  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-t px-6 py-4">
      <Button variant="ghost" onClick={onBack} disabled={backDisabled}>
        Back
      </Button>

      <div className="flex min-w-0 items-center gap-3">
        {reason && (
          <p
            id={reasonId}
            className="truncate text-xs text-muted-foreground"
            aria-live="polite"
          >
            {reason}
          </p>
        )}

        {pending ? (
          <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline">Continue anyway</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <PopoverTitle className="text-sm">{pending.summary}</PopoverTitle>
              <PopoverDescription className="mt-1 text-xs">
                {pending.detail}
              </PopoverDescription>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmOpen(false)}
                >
                  Go back
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setConfirmOpen(false);
                    onNext();
                  }}
                >
                  Continue anyway
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Button
            onClick={onNext}
            disabled={disabled}
            aria-describedby={reason ? reasonId : undefined}
          >
            {nextIcon}
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
