"use client";

import type { ReactNode } from "react";
import { ClockIcon, MapPinIcon, UserRoundIcon } from "lucide-react";

import { EventDateLeaf } from "@/components/app/events/event-date-leaf";
import { Badge } from "@/components/ui/badge";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { eventStatusDotVariant, eventVisibilityLabel, formatEventWhen } from "@/lib/events/display";
import { cn } from "@/lib/utils";
import type { Event } from "@/server/db/schema";

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
        <EventDateLeaf
          startsAt={event.startsAt}
          cancelled={event.status === "cancelled"}
          locale={locale}
          timeZone={timeZone}
        />

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Status variant={eventStatusDotVariant[event.status]}>
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
