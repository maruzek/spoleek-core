import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One line of a facts card: an icon, a small uppercase label and the value.
 * Portal detail pages (event, group) stack these in a `<dl class="divide-y">`
 * so their asides read as one family.
 */
export function FactRow({
  icon,
  label,
  children,
  muted,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className={cn("text-sm", muted ? "text-muted-foreground" : "text-foreground")}>{children}</dd>
      </div>
    </div>
  );
}

/** The card shell the fact rows sit in, shared with the RSVP card. */
export const factCardClassName = "rounded-xl border bg-card p-4 text-card-foreground";
