"use client";

import type { ReactNode } from "react";
import {
  CalendarIcon,
  CopyIcon,
  ExternalLinkIcon,
  HourglassIcon,
  LinkIcon,
  MapPinIcon,
  MessageSquareIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatEventWhen } from "@/lib/events/display";
import type { Event } from "@/server/db/schema";

function Row({
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
        <dd className={muted ? "text-sm text-muted-foreground" : "text-sm text-foreground"}>{children}</dd>
      </div>
    </div>
  );
}

/**
 * Admin-only overview: the description as the reading column, the facts as a
 * side ledger. The portal and public pages have their own (`PortalEventDetail`,
 * `PublicEventCard`); an admin wants the slug and the public link at a glance.
 */
export function EventAdminOverview({
  event,
  locale,
  timeZone,
  counts,
  publicUrl,
  onEdit,
}: {
  event: Event;
  locale: string;
  timeZone: string;
  counts: { confirmedSeats: number; reserveCount: number };
  publicUrl: string | null;
  onEdit: () => void;
}) {
  const when = formatEventWhen(event, locale, timeZone);
  const deadline = event.rsvpDeadlineAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(
        new Date(event.rsvpDeadlineAt),
      )
    : null;
  const deadlinePassed = event.rsvpDeadlineAt ? new Date(event.rsvpDeadlineAt) < new Date() : false;

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public link copied.");
    } catch {
      toast.error("Clipboard is not available in this browser.");
    }
  };

  return (
    <div className="grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="min-w-0">
        {event.descriptionHtml ? (
          <div
            className="policy-prose"
            // Sanitized on write by server/lib/policy-html.ts; rendered verbatim.
            dangerouslySetInnerHTML={{ __html: event.descriptionHtml }}
          />
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
            <p className="font-heading text-lg text-foreground">No description yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Members see this text on the event page and in invites. A sentence or two on what to expect goes a long way.
            </p>
            <Button size="sm" variant="outline" onClick={onEdit}>
              Write a description
            </Button>
          </div>
        )}
      </section>

      <aside>
        <dl className="divide-y rounded-xl border bg-card p-4">
          <Row icon={<CalendarIcon />} label="When">
            {when ?? <span className="text-muted-foreground">Date to be announced</span>}
            {event.allDay ? <span className="ml-1.5 text-xs text-muted-foreground">all day</span> : null}
          </Row>
          <Row icon={<HourglassIcon />} label="Answer by" muted={!deadline}>
            {deadline ? (
              <>
                {deadline}
                {deadlinePassed ? <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-500">passed</span> : null}
              </>
            ) : (
              "No deadline"
            )}
          </Row>
          <Row icon={<MapPinIcon />} label="Where" muted={!event.locationName && !event.locationAddress}>
            {event.locationName || event.locationAddress ? (
              <>
                {event.locationName ? <span className="block">{event.locationName}</span> : null}
                {event.locationAddress ? (
                  <span className="block text-xs text-muted-foreground">{event.locationAddress}</span>
                ) : null}
              </>
            ) : (
              "Location to be announced"
            )}
          </Row>
          <Row icon={<UsersIcon />} label="Places">
            {event.capacity ? (
              <>
                <span className="tabular-nums">
                  {counts.confirmedSeats} of {event.capacity}
                </span>{" "}
                taken
              </>
            ) : (
              "Unlimited"
            )}
            <span className="block text-xs text-muted-foreground">
              {event.maxGuestsPerResponse > 0
                ? `Up to ${event.maxGuestsPerResponse} guest${event.maxGuestsPerResponse === 1 ? "" : "s"} per person`
                : "No guests"}
            </span>
          </Row>
          {event.communicationLink ? (
            <Row icon={<MessageSquareIcon />} label="Chat">
              <a
                href={event.communicationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                Open event chat
                <ExternalLinkIcon className="size-3" aria-hidden />
              </a>
            </Row>
          ) : null}
          <Row icon={<LinkIcon />} label="Link" muted={!publicUrl}>
            {publicUrl ? (
              <span className="flex items-center gap-1">
                <span className="truncate font-mono text-xs">{publicUrl.replace(/^https?:\/\//, "")}</span>
                <button
                  type="button"
                  aria-label="Copy public link"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={copyLink}
                >
                  <CopyIcon className="size-3.5" />
                </button>
              </span>
            ) : (
              <>
                <span className="font-mono text-xs">/{event.slug}</span>
                <span className="block text-xs">Only signed-in members can open it.</span>
              </>
            )}
          </Row>
        </dl>
      </aside>
    </div>
  );
}
