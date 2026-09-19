"use client";

import { useMemo, useState } from "react";
import { dateFnsLocalizer, Views, type EventProps, type ToolbarProps } from "react-big-calendar";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import ShadcnBigCalendar from "@/components/shadcn-big-calendar/shadcn-big-calendar";
import { Button } from "@/components/ui/button";
import { dateFnsLocaleFor } from "@/lib/date-fns-locale";
import { cn } from "@/lib/utils";
import type { Event as EventRow } from "@/server/db/schema";

/** How an event reads on the grid; the caller maps its own state onto one of these. */
export type CalendarTone = "primary" | "warning" | "info" | "muted" | "pending" | "cancelled";

export type CalendarItem = {
  id: string;
  event: Pick<EventRow, "title" | "startsAt" | "endsAt" | "allDay">;
  tone: CalendarTone;
};

type RbcEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  tone: CalendarTone;
};

const TONE_CLASS: Record<CalendarTone, string> = {
  primary: "event-variant-primary",
  warning: "event-tone-warning",
  info: "event-tone-info",
  muted: "event-variant-secondary",
  pending: "event-tone-pending",
  cancelled: "event-tone-cancelled",
};

function EventChip({ event }: EventProps<RbcEvent>) {
  return (
    <span className="flex items-center gap-1.5 truncate">
      <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden />
      <span className="truncate">{event.title}</span>
    </span>
  );
}

/**
 * Month grid shared by the portal agenda and (later) the admin list. One view
 * only — week and day add nothing for a club's handful of events a month —
 * with our own toolbar so the month name sits in the heading face.
 */
export function EventsMonthCalendar({
  items,
  locale,
  labels,
  onSelect,
  className,
}: {
  items: CalendarItem[];
  locale: string;
  labels: { today: string; previousMonth: string; nextMonth: string; showMore: (n: number) => string };
  onSelect: (id: string) => void;
  className?: string;
}) {
  const dfLocale = useMemo(() => dateFnsLocaleFor(locale), [locale]);
  const localizer = useMemo(
    () =>
      dateFnsLocalizer({
        format,
        parse,
        startOfWeek: (date: Date) => startOfWeek(date, { locale: dfLocale }),
        getDay,
        locales: { [locale]: dfLocale },
      }),
    [dfLocale, locale],
  );
  const monthLabel = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }), [locale]);

  const [date, setDate] = useState(() => new Date());

  const events = useMemo<RbcEvent[]>(
    () =>
      items.flatMap(({ id, event, tone }) => {
        if (!event.startsAt) return [];
        const start = new Date(event.startsAt);
        const end = event.endsAt ? new Date(event.endsAt) : start;
        return [{ id, title: event.title, start, end, allDay: event.allDay, tone }];
      }),
    [items],
  );

  const Toolbar = ({ onNavigate, label }: ToolbarProps<RbcEvent>) => (
    <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
      <h2 className="font-semibold text-lg capitalize text-foreground">{label}</h2>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => onNavigate("TODAY")}>
          {labels.today}
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={labels.previousMonth} onClick={() => onNavigate("PREV")}>
          <ChevronLeftIcon />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={labels.nextMonth} onClick={() => onNavigate("NEXT")}>
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn("events-month-calendar overflow-hidden rounded-xl border bg-card shadow-xs", className)}>
      <ShadcnBigCalendar<RbcEvent>
        localizer={localizer}
        culture={locale}
        events={events}
        date={date}
        onNavigate={setDate}
        view={Views.MONTH}
        views={[Views.MONTH]}
        onView={() => {}}
        popup
        onSelectEvent={(event) => onSelect(event.id)}
        eventPropGetter={(event) => ({ className: TONE_CLASS[event.tone] })}
        components={{ toolbar: Toolbar, event: EventChip }}
        formats={{ monthHeaderFormat: (d) => monthLabel.format(d) }}
        messages={{ showMore: (count) => labels.showMore(count) }}
        style={{ height: "100%" }}
      />
    </div>
  );
}
