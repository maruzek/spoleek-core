import type { ReactNode } from "react";
import { CalendarIcon, ExternalLinkIcon, MapPinIcon, UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { eventStatusVariant, eventVisibilityLabel, formatEventWhen } from "@/lib/events/display";
import type { Event } from "@/server/db/schema";

export type EventDetailEvent = Pick<
  Event,
  | "title"
  | "descriptionHtml"
  | "status"
  | "visibility"
  | "startsAt"
  | "endsAt"
  | "allDay"
  | "rsvpDeadlineAt"
  | "capacity"
  | "maxGuestsPerResponse"
  | "locationName"
  | "locationAddress"
  | "communicationLink"
>;

/**
 * The one rendering of an event, shared by the admin overview, the portal and
 * the public page. The RSVP control is a slot so each surface binds its own
 * action (or passes nothing, as the admin overview does).
 */
export function EventDetail({
  event,
  ownerName,
  locale,
  timeZone,
  rsvp,
  showStatus = false,
  counts,
}: {
  event: EventDetailEvent;
  ownerName: string | null;
  locale: string;
  timeZone?: string;
  rsvp?: ReactNode;
  showStatus?: boolean;
  counts?: { confirmedSeats: number; reserveCount: number } | null;
}) {
  const when = formatEventWhen(event, locale, timeZone);
  const deadline = event.rsvpDeadlineAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(
        new Date(event.rsvpDeadlineAt),
      )
    : null;
  const where = [event.locationName, event.locationAddress].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {showStatus ? (
            <Badge variant={eventStatusVariant[event.status]} className="capitalize">
              {event.status}
            </Badge>
          ) : event.status === "cancelled" ? (
            <Badge variant="destructive">Cancelled</Badge>
          ) : null}
          {showStatus ? <Badge variant="outline">{eventVisibilityLabel[event.visibility]}</Badge> : null}
          {ownerName ? <span className="text-sm text-muted-foreground">Organised by {ownerName}</span> : null}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{event.title}</h2>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex gap-3 rounded-xl border p-4">
          <CalendarIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</dt>
            <dd className="mt-1 text-sm">{when ?? "Date to be announced"}</dd>
            {deadline ? (
              <dd className="mt-1 text-xs text-muted-foreground">Answer by {deadline}</dd>
            ) : null}
          </div>
        </div>
        <div className="flex gap-3 rounded-xl border p-4">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where</dt>
            {where.length > 0 ? (
              where.map((line, index) => (
                <dd key={index} className={index === 0 ? "mt-1 text-sm" : "text-xs text-muted-foreground"}>
                  {line}
                </dd>
              ))
            ) : (
              <dd className="mt-1 text-sm">Location to be announced</dd>
            )}
          </div>
        </div>
        {event.capacity || counts ? (
          <div className="flex gap-3 rounded-xl border p-4">
            <UsersIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Places</dt>
              <dd className="mt-1 text-sm">
                {counts
                  ? event.capacity
                    ? `${counts.confirmedSeats} of ${event.capacity} confirmed`
                    : `${counts.confirmedSeats} confirmed`
                  : `${event.capacity} places`}
                {counts && counts.reserveCount > 0 ? `, ${counts.reserveCount} on the reserve list` : null}
              </dd>
              {event.maxGuestsPerResponse > 0 ? (
                <dd className="mt-1 text-xs text-muted-foreground">
                  Up to {event.maxGuestsPerResponse} guest{event.maxGuestsPerResponse === 1 ? "" : "s"} per person
                </dd>
              ) : null}
            </div>
          </div>
        ) : null}
        {event.communicationLink ? (
          <div className="flex gap-3 rounded-xl border p-4">
            <ExternalLinkIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chat</dt>
              <dd className="mt-1 truncate text-sm">
                <a
                  href={event.communicationLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Join the event chat
                </a>
              </dd>
            </div>
          </div>
        ) : null}
      </dl>

      {rsvp ? <div>{rsvp}</div> : null}

      {event.descriptionHtml ? (
        <div
          className="policy-prose"
          // Sanitized on write by server/lib/policy-html.ts; rendered verbatim.
          dangerouslySetInnerHTML={{ __html: event.descriptionHtml }}
        />
      ) : null}
    </div>
  );
}
