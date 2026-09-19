import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BanIcon,
  CalendarIcon,
  CoinsIcon,
  ExternalLinkIcon,
  HourglassIcon,
  MapPinIcon,
  MessageSquareIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";

import { PAGE_WIDTH } from "@/components/app/app-page";
import { DetailHeader, DetailMeta, DetailMetaItem } from "@/components/app/detail-header";
import { EventDateLeaf } from "@/components/app/events/event-date-leaf";
import { FactRow, factCardClassName } from "@/components/app/fact-row";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { formatEventWhen, isLongDescription } from "@/lib/events/display";
import { formatMoney } from "@/lib/payments";
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
  manageHref,
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
  /** Admin record of this event, for viewers who may manage it. */
  manageHref?: string | null;
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
    <div className={cn("flex flex-col gap-6", PAGE_WIDTH.split)}>
      <DetailHeader
        backHref="/portal/events"
        backLabel={d.back}
        leading={<EventDateLeaf startsAt={event.startsAt} cancelled={cancelled} locale={locale} timeZone={timeZone} />}
        badges={
          cancelled || outcome ? (
            <>
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
            </>
          ) : null
        }
        title={event.title}
        titleClassName={cancelled ? "text-muted-foreground line-through decoration-1" : undefined}
        meta={
          <DetailMeta>
            <DetailMetaItem icon={<CalendarIcon aria-hidden />}>{when ?? t.dateTba}</DetailMetaItem>
            {where ? <DetailMetaItem icon={<MapPinIcon aria-hidden />}>{where}</DetailMetaItem> : null}
            <DetailMetaItem icon={<UserRoundIcon aria-hidden />}>{t.organisedBy(ownerName)}</DetailMetaItem>
          </DetailMeta>
        }
        actions={
          manageHref ? (
            <Button asChild variant="outline" size="sm">
              <Link href={manageHref}>
                <span className="hidden sm:inline">{d.manageInAdmin}</span>
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          ) : null
        }
      />

      {cancelled ? (
        <Notice
          tone="danger"
          icon={<BanIcon />}
          title={d.cancelledTitle}
          description={d.cancelledBody}
        />
      ) : outcome === "reserve" ? (
        <Notice
          tone="attention"
          icon={<HourglassIcon />}
          title={d.reserveTitle}
          description={d.reserveBody}
        />
      ) : null}

      <div className={cn("grid gap-8", twoColumn && "lg:grid-cols-[minmax(0,1fr)_20rem]")}>
        <section className="min-w-0">
          {forms ? <div className="mb-8">{forms}</div> : null}
          {/* No placeholder when the organiser wrote nothing; `d.noDescription` is kept should one come back. */}
          {event.descriptionHtml ? (
            <div
              className="policy-prose"
              // Sanitized on write by server/lib/policy-html.ts; rendered verbatim.
              dangerouslySetInnerHTML={{ __html: event.descriptionHtml }}
            />
          ) : null}
        </section>

        <aside
          className={cn(
            "grid content-start gap-4",
            twoColumn ? "lg:sticky lg:top-6 lg:self-start" : "sm:grid-cols-2 sm:items-start",
          )}
        >
          {/* The RSVP control and, when the event charges, the payment card below it. */}
          <div className="grid gap-4">{rsvp}</div>

          <dl className={cn("divide-y", factCardClassName)}>
            <FactRow icon={<CalendarIcon />} label={d.when}>
              {when ?? <span className="text-muted-foreground">{t.dateTba}</span>}
              {event.allDay ? <span className="ml-1.5 text-xs text-muted-foreground">{d.allDay}</span> : null}
            </FactRow>
            {deadline ? (
              <FactRow icon={<HourglassIcon />} label={d.answerBy}>
                {deadline}
                {deadlinePassed ? (
                  <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-500">{d.deadlinePassed}</span>
                ) : null}
              </FactRow>
            ) : null}
            <FactRow icon={<MapPinIcon />} label={d.where} muted={!where}>
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
            </FactRow>
            <FactRow icon={<UsersIcon />} label={d.places}>
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
            </FactRow>
            {event.priceAmount !== null && event.priceCurrency ? (
              <FactRow icon={<CoinsIcon />} label={d.price}>
                {d.pricePerPerson(formatMoney(event.priceAmount, event.priceCurrency, locale))}
                {event.maxGuestsPerResponse > 0 ? (
                  <span className="block text-xs text-muted-foreground">{d.priceGuestsToo}</span>
                ) : null}
              </FactRow>
            ) : null}
            {event.communicationLink ? (
              <FactRow icon={<MessageSquareIcon />} label={d.chat}>
                <a
                  href={event.communicationLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                >
                  {d.openChat}
                  <ExternalLinkIcon className="size-3" aria-hidden />
                </a>
              </FactRow>
            ) : null}
          </dl>
        </aside>
      </div>
    </div>
  );
}
