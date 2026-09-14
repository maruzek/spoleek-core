import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  BanIcon,
  CalendarIcon,
  ExternalLinkIcon,
  HourglassIcon,
  MapPinIcon,
  MessageSquareIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";

import { EventDateLeaf } from "@/components/app/events/event-date-leaf";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { formatEventWhen, isLongDescription } from "@/lib/events/display";
import type { Dictionary } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import type { Event, EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

type Outcome = "going" | "reserve" | "maybe" | "no";

const OUTCOME_VARIANT: Record<Outcome, "success" | "warning" | "info" | "default"> = {
  going: "success",
  reserve: "warning",
  maybe: "info",
  no: "default",
};

function outcomeOf(response: { answer: EventRsvpAnswer; standing: EventRsvpStanding } | null): Outcome | null {
  if (!response) return null;
  if (response.answer === "yes") return response.standing === "reserve" ? "reserve" : "going";
  return response.answer;
}

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
 * The attendee's view: same header language as the admin record (date leaf,
 * serif title, one meta line), but the page is built around one question —
 * are you coming? The RSVP card is the right column and sticks; the facts an
 * attendee needs (deadline, places left, how many guests) sit under it.
 */
export function PortalEventDetail({
  event,
  ownerName,
  locale,
  timeZone,
  counts,
  response,
  rsvp,
  forms,
  t,
}: {
  event: Event;
  ownerName: string;
  locale: string;
  timeZone: string;
  counts: { confirmedSeats: number; reserveCount: number };
  response: { answer: EventRsvpAnswer; standing: EventRsvpStanding } | null;
  rsvp: ReactNode;
  /** The event's forms block, rendered above the description so it is not missed. */
  forms?: ReactNode;
  t: Dictionary["events"];
}) {
  const d = t.detail;
  const when = formatEventWhen(event, locale, timeZone);
  const where = event.locationName ?? event.locationAddress;
  const deadline = event.rsvpDeadlineAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(
        new Date(event.rsvpDeadlineAt),
      )
    : null;
  const deadlinePassed = event.rsvpDeadlineAt ? new Date(event.rsvpDeadlineAt) < new Date() : false;
  const cancelled = event.status === "cancelled";
  const outcome = outcomeOf(response);
  const placesLeft = event.capacity ? Math.max(0, event.capacity - counts.confirmedSeats) : null;
  const twoColumn = isLongDescription(event.descriptionHtml);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/events">
            <ArrowLeftIcon data-icon="inline-start" />
            {d.back}
          </Link>
        </Button>
      </div>

      <header className="flex items-start gap-4">
        <EventDateLeaf startsAt={event.startsAt} cancelled={cancelled} locale={locale} timeZone={timeZone} />
        <div className="flex min-w-0 flex-col gap-1.5">
          {cancelled || outcome ? (
            <div className="flex flex-wrap items-center gap-2">
              {cancelled ? (
                <Status variant="error">
                  <StatusIndicator />
                  <StatusLabel>{t.cancelled}</StatusLabel>
                </Status>
              ) : null}
              {outcome ? (
                <Status variant={OUTCOME_VARIANT[outcome]}>
                  <StatusIndicator />
                  <StatusLabel>{d.yourStatus[outcome]}</StatusLabel>
                </Status>
              ) : null}
            </div>
          ) : null}
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
            <div className="flex items-center gap-1.5">
              <UserRoundIcon className="size-3.5" aria-hidden />
              <dd>{t.organisedBy(ownerName)}</dd>
            </div>
          </dl>
        </div>
      </header>

      {cancelled ? (
        <Alert className="max-w-4xl border-destructive/30 bg-destructive/5 px-4 py-3.5">
          <BanIcon className="text-destructive" />
          <AlertTitle className="text-base text-destructive">{d.cancelledTitle}</AlertTitle>
          <AlertDescription>{d.cancelledBody}</AlertDescription>
        </Alert>
      ) : outcome === "reserve" ? (
        <Alert className="max-w-4xl border-amber-500/30 bg-amber-500/5 px-4 py-3.5">
          <HourglassIcon className="text-amber-600 dark:text-amber-500" />
          <AlertTitle className="text-base text-amber-700 dark:text-amber-500">{d.reserveTitle}</AlertTitle>
          <AlertDescription>{d.reserveBody}</AlertDescription>
        </Alert>
      ) : null}

      <div className={cn("grid gap-8", twoColumn ? "max-w-5xl lg:grid-cols-[minmax(0,1fr)_20rem]" : "max-w-4xl")}>
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

        <aside
          className={cn(
            "grid content-start gap-4",
            twoColumn ? "lg:sticky lg:top-6 lg:self-start" : "sm:grid-cols-2 sm:items-start",
          )}
        >
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
            <Row icon={<UsersIcon />} label={d.places}>
              {placesLeft == null ? (
                d.unlimited
              ) : placesLeft === 0 ? (
                <span className="text-amber-700 dark:text-amber-500">{d.placesFull}</span>
              ) : (
                d.placesLeft(placesLeft)
              )}
              <span className="block text-xs text-muted-foreground">
                {d.goingCount(counts.confirmedSeats)}
                {event.maxGuestsPerResponse > 0 ? ` · ${d.guestsAllowed(event.maxGuestsPerResponse)}` : ""}
              </span>
            </Row>
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
    </div>
  );
}
