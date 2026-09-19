"use client";

import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { STATUS_DOT_CLASSES } from "@/lib/status-dot";
import { cn } from "@/lib/utils";

/**
 * The pieces every dashboard is built from — admin and portal share them so
 * the two pages read as one product: a sans heading with a muted count, three
 * fixed-height scrolling lists, hairline rows that light up on hover, and one
 * coloured dot reserved for the few rows that really are urgent.
 */

/** The lists share one height so a row of them reads as one band. */
export const LIST_HEIGHT = "h-[22rem]";

/** Staggered entrance. Each row starts a beat after the previous one. */
export function reveal(index: number): { className: string; style: CSSProperties } {
  return {
    className: "animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-400 ease-out",
    style: { animationDelay: `${Math.min(index, 10) * 40}ms` },
  };
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** The calm state of an attention list: a tick and one line. */
export function AllClear({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CheckIcon className="size-4" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export const rowLink =
  "group -mx-2 flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

/** A list that scrolls inside the shared height instead of growing the page. */
export function ScrollList({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className={LIST_HEIGHT}>
      <div className="pr-3">{children}</div>
    </ScrollArea>
  );
}

/**
 * One hairline row: title, a muted line under it, and an arrow that appears
 * on hover. `urgent` adds the coloured dot at the row's end.
 */
export function ListRow({
  href,
  index,
  title,
  meta,
  urgent,
  trailing,
}: {
  href: string;
  index: number;
  title: ReactNode;
  meta: ReactNode;
  urgent?: "error" | "warning" | null;
  trailing?: ReactNode;
}) {
  const r = reveal(index);
  return (
    <li className={cn("border-b border-border last:border-b-0", r.className)} style={r.style}>
      <Link href={href} className={rowLink}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">{meta}</span>
        </span>
        {trailing}
        {urgent ? (
          <span
            aria-hidden
            className={cn("mt-1.5 size-2 shrink-0 rounded-full", STATUS_DOT_CLASSES[urgent])}
          />
        ) : null}
        <ArrowRightIcon
          aria-hidden
          className="mt-1 size-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground"
        />
      </Link>
    </li>
  );
}

export function dayHeading(dayOffset: number, date: Date, locale: string) {
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(
    date,
  );
}

/** "Sat 26 Sep · in 9 days" — one heading per day group in a timeline. */
export function DayHeading({
  dayOffset,
  date,
  locale,
}: {
  dayOffset: number;
  date: Date;
  locale: string;
}) {
  return (
    <h3
      className={cn(
        "mb-1 font-sans text-xs font-semibold tracking-wider uppercase",
        dayOffset === 0 ? "text-primary" : "text-muted-foreground",
      )}
    >
      {dayHeading(dayOffset, date, locale)}
      {dayOffset > 1 ? (
        <span className="ml-2 font-normal normal-case tracking-normal">in {dayOffset} days</span>
      ) : null}
    </h3>
  );
}

export function relativeTime(at: Date, now: Date, locale: string, daysBetween: number) {
  const diffMs = at.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(diffMs / 3_600_000);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(daysBetween, "day");
}
