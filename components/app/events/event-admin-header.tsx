"use client";

import type { ReactNode } from "react";
import { ClockIcon, MapPinIcon, UserRoundIcon } from "lucide-react";

import { DetailHeader, DetailMeta, DetailMetaItem } from "@/components/app/detail-header";
import { EventDateLeaf } from "@/components/app/events/event-date-leaf";
import { Badge } from "@/components/ui/badge";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { eventStatusDotVariant, eventVisibilityLabel, formatEventWhen } from "@/lib/events/display";
import type { Event } from "@/server/db/schema";

export function EventAdminHeader({
  event,
  ownerName,
  locale,
  timeZone,
  actions,
  backHref,
  backLabel,
}: {
  event: Event;
  ownerName: string | null;
  locale: string;
  timeZone: string;
  actions: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const when = formatEventWhen(event, locale, timeZone);
  const where = event.locationName ?? event.locationAddress;
  const cancelled = event.status === "cancelled";

  return (
    <DetailHeader
      backHref={backHref}
      backLabel={backLabel}
      leading={
        <EventDateLeaf
          startsAt={event.startsAt}
          cancelled={cancelled}
          locale={locale}
          timeZone={timeZone}
        />
      }
      badges={
        <>
          <Status variant={eventStatusDotVariant[event.status]}>
            <StatusIndicator />
            <StatusLabel className="capitalize">{event.status}</StatusLabel>
          </Status>
          <Badge variant="outline">{eventVisibilityLabel[event.visibility]}</Badge>
        </>
      }
      title={event.title}
      titleClassName={cancelled ? "text-muted-foreground line-through decoration-1" : undefined}
      meta={
        <DetailMeta>
          <DetailMetaItem icon={<ClockIcon aria-hidden />}>
            {when ?? "Date to be announced"}
          </DetailMetaItem>
          {where ? <DetailMetaItem icon={<MapPinIcon aria-hidden />}>{where}</DetailMetaItem> : null}
          <DetailMetaItem icon={<UserRoundIcon aria-hidden />}>
            {ownerName ?? "Whole organization"}
          </DetailMetaItem>
        </DetailMeta>
      }
      actions={actions}
    />
  );
}
