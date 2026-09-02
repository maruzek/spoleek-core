"use client";

import { InfoIcon } from "lucide-react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

/**
 * Helper text folded into an icon beside a field label, so a form full of
 * explanations reads as a form rather than a wall of prose.
 *
 * The trigger is a real button: hover cards do not open on touch, and pointer
 * hover is not available to keyboard users, so focus has to open it too.
 * Reserve this for text that clarifies; anything a member must read before
 * answering still belongs in a visible `FieldDescription`.
 */
export function FieldHint({
  children,
  label = "More information",
  className,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            className,
          )}
        >
          <InfoIcon className="size-3.5" aria-hidden="true" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-72 text-sm leading-6 font-normal text-muted-foreground"
      >
        {children}
      </HoverCardContent>
    </HoverCard>
  );
}
