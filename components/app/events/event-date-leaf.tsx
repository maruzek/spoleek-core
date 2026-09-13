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
  const box = size === "lg" ? "size-[4.5rem] rounded-xl" : "h-11 w-10 rounded-lg";

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
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone }).format(date);
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
          size === "lg" ? "py-0.5 text-[10px] tracking-widest" : "text-[8px] leading-[11px] tracking-wider",
        )}
      >
        {weekday}
      </span>
      <span className={cn("flex flex-1 flex-col items-center justify-center", size === "lg" ? "gap-0.5 pb-1" : "pb-px")}>
        <span
          className={cn(
            "font-heading leading-none tracking-tight text-foreground",
            size === "lg" ? "text-[1.75rem]" : "text-base",
          )}
        >
          {day}
        </span>
        <span
          className={cn(
            "font-semibold uppercase leading-none tracking-wider text-muted-foreground",
            size === "lg" ? "text-[10px]" : "text-[8px]",
          )}
        >
          {month}
        </span>
      </span>
    </div>
  );
}
