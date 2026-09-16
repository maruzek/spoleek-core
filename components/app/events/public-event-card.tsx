import type { ReactNode } from "react";
import {
  CalendarIcon,
  CoinsIcon,
  ExternalLinkIcon,
  HourglassIcon,
  MapPinIcon,
  MessageSquareIcon,
  UsersIcon,
} from "lucide-react";

import { EventDateLeaf } from "@/components/app/events/event-date-leaf";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { formatEventWhen, isLongDescription } from "@/lib/events/display";
import { formatFeeAmount } from "@/lib/payments";
import type { Dictionary } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import type { Event } from "@/server/db/schema";

function Row({ icon, label, children, muted }: { icon: ReactNode; label: string; children: ReactNode; muted?: boolean }) {
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

/**
 * The white card on the public canvas, shared by the public event page and
 * the personal-link page. Same language as the portal detail — date leaf,
 * serif title, description left, answer right — inside the one card the
 * signed-out surfaces already use.
 */
export function PublicEventCard({
  event,
  ownerName,
  locale,
  timeZone,
  counts,
  rsvp,
  forms,
  note,
  t,
}: {
  event: Event;
  ownerName: string;
  locale: string;
  timeZone: string;
  counts: { confirmedSeats: number; reserveCount: number } | null;
  rsvp: ReactNode;
  /** The event's open forms, rendered above the description. */
  forms?: ReactNode;
  /** Line above the header, e.g. "Answering as …" on a personal link. */
  note?: ReactNode;
  t: Dictionary["events"];
}) {
  const d = t.detail;
  const when = formatEventWhen(event, locale, timeZone);
  const where = event.locationName ?? event.locationAddress;
  const cancelled = event.status === "cancelled";
  const deadline = event.rsvpDeadlineAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(
        new Date(event.rsvpDeadlineAt),
      )
    : null;
  const deadlinePassed = event.rsvpDeadlineAt ? new Date(event.rsvpDeadlineAt) < new Date() : false;
  const placesLeft = event.capacity && counts ? Math.max(0, event.capacity - counts.confirmedSeats) : null;
  const twoColumn = isLongDescription(event.descriptionHtml);

  return (
    <article className="mx-auto w-full max-w-4xl rounded-2xl border bg-background p-6 shadow-sm md:p-8">
      {note ? <p className="mb-4 text-sm text-muted-foreground">{note}</p> : null}

      <header className="flex items-start gap-4">
        <EventDateLeaf startsAt={event.startsAt} cancelled={cancelled} locale={locale} timeZone={timeZone} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">{t.organisedBy(ownerName)}</p>
            {cancelled ? (
              <Status variant="error">
                <StatusIndicator />
                <StatusLabel>{t.cancelled}</StatusLabel>
              </Status>
            ) : null}
          </div>
          <h1
            className={cn(
              "font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl",
              cancelled && "text-muted-foreground line-through decoration-1",
            )}
          >
            {event.title}
          </h1>
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" aria-hidden />
              <dd>{when ?? t.dateTba}</dd>
            </div>
            {where ? (
              <div className="flex items-center gap-1.5">
                <MapPinIcon className="size-3.5" aria-hidden />
                <dd className="truncate">{where}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </header>

      <div className={cn("mt-8 grid gap-8", twoColumn && "md:grid-cols-[minmax(0,1fr)_18rem]")}>
        <section className="min-w-0">
          {forms ? <div className="mb-8">{forms}</div> : null}
          {event.descriptionHtml ? (
            <div
              className="policy-prose"
              // Sanitized on write by server/lib/policy-html.ts; rendered verbatim.
              dangerouslySetInnerHTML={{ __html: event.descriptionHtml }}
            />
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{d.noDescription}</p>
          )}
        </section>

        <aside className={cn("grid content-start gap-4", twoColumn ? "md:self-start" : "sm:grid-cols-2 sm:items-start")}>
          <div className="rounded-xl border bg-card p-4 shadow-xs">{rsvp}</div>

          <dl className="divide-y rounded-xl border bg-card p-4">
            <Row icon={<CalendarIcon />} label={d.when}>
              {when ?? <span className="text-muted-foreground">{t.dateTba}</span>}
              {event.allDay ? <span className="ml-1.5 text-xs text-muted-foreground">{d.allDay}</span> : null}
            </Row>
            {deadline ? (
              <Row icon={<HourglassIcon />} label={d.answerBy}>
                {deadline}
                {deadlinePassed ? (
                  <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-500">{d.deadlinePassed}</span>
                ) : null}
              </Row>
            ) : null}
            <Row icon={<MapPinIcon />} label={d.where} muted={!where}>
              {where ? (
                <>
                  {event.locationName ? <span className="block">{event.locationName}</span> : null}
                  {event.locationAddress ? (
                    <span className="block text-xs text-muted-foreground">{event.locationAddress}</span>
                  ) : null}
                </>
              ) : (
                d.locationTba
              )}
            </Row>
            {event.capacity || event.maxGuestsPerResponse > 0 ? (
              <Row icon={<UsersIcon />} label={d.places}>
                {placesLeft == null ? (
                  d.unlimited
                ) : placesLeft === 0 ? (
                  <span className="text-amber-700 dark:text-amber-500">{d.placesFull}</span>
                ) : (
                  d.placesLeft(placesLeft)
                )}
                {event.maxGuestsPerResponse > 0 ? (
                  <span className="block text-xs text-muted-foreground">{d.guestsAllowed(event.maxGuestsPerResponse)}</span>
                ) : null}
              </Row>
            ) : null}
            {event.priceAmount !== null && event.priceCurrency ? (
              <Row icon={<CoinsIcon />} label={d.price}>
                {d.pricePerPerson(formatFeeAmount(event.priceAmount, event.priceCurrency))}
                {event.maxGuestsPerResponse > 0 ? (
                  <span className="block text-xs text-muted-foreground">{d.priceGuestsToo}</span>
                ) : null}
              </Row>
            ) : null}
            {event.communicationLink ? (
              <Row icon={<MessageSquareIcon />} label={d.chat}>
                <a
                  href={event.communicationLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                >
                  {d.openChat}
                  <ExternalLinkIcon className="size-3" aria-hidden />
                </a>
              </Row>
            ) : null}
          </dl>
        </aside>
      </div>
    </article>
  );
}
