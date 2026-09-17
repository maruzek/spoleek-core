import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Tear-off calendar leaf. Big serif day, small month, weekday on a green band —
 * the one thing an admin should recognise an event by, on the detail header
 * (`lg`) and in every list row (`sm`). Falls back to a calendar glyph when
 * the date is still open.
 */
export function EventDateLeaf({
  startsAt,
  cancelled = false,
  locale,
  timeZone,
  size = "lg",
  className,
}: {
  startsAt: Date | string | null;
  cancelled?: boolean;
  locale: string;
  timeZone?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const box = size === "lg" ? "size-[4.5rem] rounded-xl" : "h-12 w-10 rounded-lg";

  if (!startsAt) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex shrink-0 flex-col items-center justify-center border border-dashed text-muted-foreground",
          box,
          className,
        )}
      >
        <CalendarIcon className={size === "lg" ? "size-5" : "size-3.5"} />
        {size === "lg" ? <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider">TBA</span> : null}
      </div>
    );
  }

  const date = new Date(startsAt);
  // Czech-style "5." loses its period: the leaf is a glyph, not a sentence.
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone }).format(date).replace(".", "");
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone }).format(date).replace(".", "");
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(date).replace(".", "");

  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 flex-col items-center overflow-hidden border bg-card shadow-xs",
        box,
        cancelled && "opacity-60 grayscale",
        className,
      )}
    >
      <span
        className={cn(
          "w-full bg-primary text-center font-semibold uppercase text-primary-foreground",
          size === "lg" ? "h-4 text-[10px] leading-4 tracking-widest" : "h-[11px] text-[8px] leading-[11px] tracking-wider",
        )}
      >
        {weekday}
      </span>
      {/* Fixed line boxes rather than flex centring: the serif has a tall
          ascender box, and letting it size the row pushed the month out of
          the leaf. Band + day + month must add up to the box height. */}
      <span
        className={cn(
          "block w-full text-center font-heading tracking-tight text-foreground",
          size === "lg" ? "h-9 text-[1.75rem] leading-9" : "h-6 text-base leading-6",
        )}
      >
        {day}
      </span>
      <span
        className={cn(
          "block w-full text-center font-semibold uppercase tracking-wider text-muted-foreground",
          size === "lg" ? "h-4 text-[10px] leading-4" : "h-3 text-[8px] leading-3",
        )}
      >
        {month}
      </span>
    </div>
  );
}
