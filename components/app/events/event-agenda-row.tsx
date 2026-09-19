"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, MapPinIcon } from "lucide-react";

import { EventDateLeaf } from "@/components/app/events/event-date-leaf";
import { useDictionary } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { formatEventWhen } from "@/lib/events/display";
import { cn } from "@/lib/utils";
import type { ViewerEventItem } from "@/server/queries/events";

export type EventOutcome = "pending" | "going" | "reserve" | "maybe" | "no";

const OUTCOME_VARIANT: Record<EventOutcome, "success" | "warning" | "info" | "default"> = {
  pending: "default",
  going: "success",
  reserve: "warning",
  maybe: "info",
  no: "default",
};

export function eventOutcomeOf(item: ViewerEventItem): EventOutcome {
  const r = item.response;
  if (!r) return "pending";
  if (r.answer === "yes") return r.standing === "reserve" ? "reserve" : "going";
  return r.answer;
}

/**
 * One agenda row: date leaf, title with its badges, where and when, and the
 * member's standing at the end. Shared by the portal agenda and the group
 * page so an event looks the same wherever the member meets it.
 */
export function EventAgendaRow({
  item,
  locale,
  timeZone,
  past = false,
  pendingFormCount = 0,
  extraBadges,
}: {
  item: ViewerEventItem;
  locale: string;
  timeZone: string;
  /** Past rows never ask for an answer. */
  past?: boolean;
  pendingFormCount?: number;
  /** Rendered after the built-in badges. */
  extraBadges?: ReactNode;
}) {
  const dict = useDictionary();
  const t = dict.events;
  const l = t.list;
  const f = dict.forms;
  const { event, ownerName } = item;
  const outcome = eventOutcomeOf(item);
  const cancelled = event.status === "cancelled";
  const where = event.locationName ?? event.locationAddress;
  const needsAnswer = outcome === "pending" && !cancelled && !past;

  return (
    <li>
      <Link
        href={`/portal/events/${event.slug}`}
        className={cn(
          "group flex items-center gap-4 rounded-xl border bg-card p-3 pr-4 shadow-xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          needsAnswer && "border-amber-500/40",
          cancelled && "opacity-70",
        )}
      >
        <EventDateLeaf startsAt={event.startsAt} cancelled={cancelled} locale={locale} timeZone={timeZone} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-lg leading-tight text-foreground",
                cancelled && "text-muted-foreground line-through decoration-1",
              )}
            >
              {event.title}
            </span>
            {event.visibility === "targeted" ? <Badge variant="outline">{l.invitedBadge}</Badge> : null}
            {cancelled ? <Badge variant="destructive">{l.cancelledBadge}</Badge> : null}
            {pendingFormCount > 0 ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-500">
                {f.event.pendingHint(pendingFormCount)}
              </Badge>
            ) : null}
            {extraBadges}
          </div>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span>{formatEventWhen(event, locale, timeZone) ?? t.dateTba}</span>
            {where ? (
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-3.5" aria-hidden />
                <span className="truncate">{where}</span>
              </span>
            ) : null}
            <span className="hidden sm:inline">{t.organisedBy(ownerName ?? t.wholeOrganization)}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {needsAnswer ? (
            <Button size="sm" tabIndex={-1} className="pointer-events-none">
              {l.answer}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          ) : outcome !== "pending" ? (
            <Status variant={OUTCOME_VARIANT[outcome]}>
              <StatusIndicator />
              <StatusLabel>{t.detail.yourStatus[outcome]}</StatusLabel>
            </Status>
          ) : (
            <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          )}
        </div>
      </Link>
    </li>
  );
}
