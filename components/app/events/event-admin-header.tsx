"use client";

import type { ReactNode } from "react";
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  UserRoundIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { eventVisibilityLabel, formatEventWhen } from "@/lib/events/display";
import { cn } from "@/lib/utils";
import type { Event } from "@/server/db/schema";

const STATUS_VARIANT: Record<Event["status"], "default" | "success" | "error"> =
  {
    draft: "default",
    published: "success",
    cancelled: "error",
  };

/**
 * Tear-off calendar leaf. Big serif day, small month and weekday — the one
 * thing an admin scanning a list of open tabs should recognise the event by.
 * Falls back to a calendar glyph when the date is still open.
 */
function DateLeaf({
  startsAt,
  cancelled,
  locale,
  timeZone,
}: {
  startsAt: Date | string | null;
  cancelled: boolean;
  locale: string;
  timeZone: string;
}) {
  if (!startsAt) {
    return (
      <div className="flex size-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed text-muted-foreground">
        <CalendarIcon className="size-5" aria-hidden />
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider">
          TBA
        </span>
      </div>
    );
  }

  const date = new Date(startsAt);
  const day = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    timeZone,
  }).format(date);
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone })
    .format(date)
    .replace(".", "");
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone,
  })
    .format(date)
    .replace(".", "");

  return (
    <div
      aria-hidden
      className={cn(
        "flex size-[4.5rem] shrink-0 flex-col items-center overflow-hidden rounded-xl border bg-card shadow-xs",
        cancelled && "opacity-60 grayscale",
      )}
    >
      <span className="w-full bg-primary py-0.5 text-center text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
        {weekday}
      </span>
      <span className="flex flex-1 flex-col items-center justify-center gap-0.5 pb-1">
        <span className="font-heading text-[1.75rem] leading-none tracking-tight text-foreground">
          {day}
        </span>
        <span className="text-[10px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">
          {month}
        </span>
      </span>
    </div>
  );
}

export function EventAdminHeader({
  event,
  ownerName,
  locale,
  timeZone,
  actions,
}: {
  event: Event;
  ownerName: string | null;
  locale: string;
  timeZone: string;
  actions: ReactNode;
}) {
  const when = formatEventWhen(event, locale, timeZone);
  const where = event.locationName ?? event.locationAddress;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <DateLeaf
          startsAt={event.startsAt}
          cancelled={event.status === "cancelled"}
          locale={locale}
          timeZone={timeZone}
        />

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Status variant={STATUS_VARIANT[event.status]}>
              <StatusIndicator />
              <StatusLabel className="capitalize">{event.status}</StatusLabel>
            </Status>
            <Badge variant="outline">
              {eventVisibilityLabel[event.visibility]}
            </Badge>
          </div>

          <h1
            className={cn(
              "font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl",
              event.status === "cancelled" &&
                "text-muted-foreground line-through decoration-1",
            )}
          >
            {event.title}
          </h1>

          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <ClockIcon className="size-3.5" aria-hidden />
              <dd>{when ?? "Date to be announced"}</dd>
            </div>
            {where ? (
              <div className="flex items-center gap-1.5">
                <MapPinIcon className="size-3.5" aria-hidden />
                <dd className="truncate">{where}</dd>
              </div>
            ) : null}
            <div className="flex items-center gap-1.5">
              <UserRoundIcon className="size-3.5" aria-hidden />
              <dd>{ownerName ?? "Whole organization"}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {actions}
      </div>
    </div>
  );
}
