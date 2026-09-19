"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDaysIcon, CalendarIcon, ListIcon, SearchIcon } from "lucide-react";

import { EventAgendaRow, type EventOutcome, eventOutcomeOf } from "@/components/app/events/event-agenda-row";
import { EventsMonthCalendar, type CalendarTone } from "@/components/app/events/events-month-calendar";
import { StatusFilter, type StatusFilterOption } from "@/components/app/status-filter";
import { useDictionary } from "@/components/locale-provider";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { matchesSearch } from "@/lib/search";
import { STATUS_DOT_CLASSES } from "@/lib/status-dot";
import { cn } from "@/lib/utils";
import type { ViewerEventItem } from "@/server/queries/events";

type Outcome = EventOutcome;
type Window = "upcoming" | "past";
type View = "list" | "calendar";

const OUTCOME_TONE: Record<Outcome, CalendarTone> = {
  pending: "pending",
  going: "primary",
  reserve: "warning",
  maybe: "info",
  no: "muted",
};

/**
 * The attendee's agenda: one list, grouped by month, newest question first.
 * No table — a member scanning for "what do I still need to answer" wants
 * dates and titles they can read at a glance, and a pill that says where
 * they stand. Search and the answer filter narrow the same list.
 */
export function PortalEventsAgenda({
  upcoming,
  past,
  locale,
  timeZone,
  pendingForms = {},
}: {
  upcoming: ViewerEventItem[];
  past: ViewerEventItem[];
  locale: string;
  timeZone: string;
  /** eventId → number of required forms the member still has to fill in. */
  pendingForms?: Record<string, number>;
}) {
  const dict = useDictionary();
  const t = dict.events;
  const l = t.list;
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [window, setWindow] = useState<Window>("upcoming");
  const [query, setQuery] = useState("");

  const outcomeOptions = useMemo<StatusFilterOption<Outcome>[]>(
    () => [
      { value: "pending", label: l.needsAnswer, dotClassName: "bg-amber-500" },
      { value: "going", label: t.answer.yes, dotClassName: STATUS_DOT_CLASSES.success },
      { value: "reserve", label: t.detail.yourStatus.reserve, dotClassName: STATUS_DOT_CLASSES.warning },
      { value: "maybe", label: t.answer.maybe, dotClassName: STATUS_DOT_CLASSES.info },
      { value: "no", label: t.answer.no, dotClassName: STATUS_DOT_CLASSES.default },
    ],
    [l, t],
  );
  const [outcomes, setOutcomes] = useState<Outcome[]>(() => outcomeOptions.map((o) => o.value));

  const source = window === "upcoming" ? upcoming : past;
  const pendingCount = useMemo(() => upcoming.filter((i) => eventOutcomeOf(i) === "pending").length, [upcoming]);

  const monthLabel = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone }), [locale, timeZone]);

  const groups = useMemo(() => {
    const rows = source
      .filter((i) => outcomes.includes(eventOutcomeOf(i)))
      .filter((i) =>
        matchesSearch(
          [i.event.title, i.event.locationName ?? "", i.event.locationAddress ?? "", i.ownerName ?? ""].join(" "),
          query,
        ),
      )
      .sort((a, b) => {
        const x = a.event.startsAt ? new Date(a.event.startsAt).getTime() : null;
        const y = b.event.startsAt ? new Date(b.event.startsAt).getTime() : null;
        if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
        return window === "past" ? y - x : x - y;
      });

    const out: { key: string; label: string; items: ViewerEventItem[] }[] = [];
    for (const item of rows) {
      const key = item.event.startsAt ? monthLabel.format(new Date(item.event.startsAt)) : "tba";
      const label = key === "tba" ? l.dateTba : key;
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(item);
      else out.push({ key, label, items: [item] });
    }
    return out;
  }, [source, outcomes, query, window, monthLabel, l.dateTba]);

  const calendarItems = useMemo(
    () =>
      [...upcoming, ...past]
        .filter((i) => outcomes.includes(eventOutcomeOf(i)))
        .filter((i) =>
          matchesSearch(
            [i.event.title, i.event.locationName ?? "", i.event.locationAddress ?? "", i.ownerName ?? ""].join(" "),
            query,
          ),
        )
        .map((i) => ({
          id: i.event.slug,
          event: i.event,
          tone: i.event.status === "cancelled" ? ("cancelled" as const) : OUTCOME_TONE[eventOutcomeOf(i)],
        })),
    [upcoming, past, outcomes, query],
  );

  const filtered = query.trim().length > 0 || outcomes.length !== outcomeOptions.length;
  const emptyTitle = filtered ? l.noMatch : window === "upcoming" ? l.nothingUpcoming : l.nothingPast;
  const emptyBody = filtered ? l.noMatchBody : window === "upcoming" ? l.nothingUpcomingBody : l.nothingPastBody;

  return (
    <div className={cn("flex flex-col gap-6", view === "list" ? "max-w-4xl" : "max-w-6xl")}>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          aria-label={l.viewList + " / " + l.viewCalendar}
        >
          <ToggleGroupItem value="list" aria-label={l.viewList}>
            <ListIcon className="size-4" aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="calendar" aria-label={l.viewCalendar}>
            <CalendarDaysIcon className="size-4" aria-hidden />
          </ToggleGroupItem>
        </ToggleGroup>
        {view === "list" ? (
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={window}
            onValueChange={(v) => v && setWindow(v as Window)}
            aria-label={l.upcoming + " / " + l.past}
          >
            <ToggleGroupItem value="upcoming" className="gap-1.5 px-3">
              {l.upcoming}
              <span className="text-xs tabular-nums text-muted-foreground">{upcoming.length}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="past" className="gap-1.5 px-3">
              {l.past}
              <span className="text-xs tabular-nums text-muted-foreground">{past.length}</span>
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
        <StatusFilter options={outcomeOptions} value={outcomes} onChange={setOutcomes} label={l.filterLabel} ariaLabel={l.filterLabel} />
        <InputGroup className="w-full sm:ml-auto sm:w-64">
          <InputGroupAddon align="inline-start">
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={l.search}
            aria-label={l.search}
            autoComplete="off"
          />
        </InputGroup>
      </div>

      {pendingCount > 0 && !filtered && (view === "calendar" || window === "upcoming") ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-amber-700 dark:text-amber-500">{l.waiting(pendingCount)}</span>
          {" · "}
          {l.answered(upcoming.length - pendingCount)}
        </p>
      ) : null}

      {view === "calendar" ? (
        <EventsMonthCalendar
          items={calendarItems}
          locale={locale}
          labels={{ today: l.today, previousMonth: l.previousMonth, nextMonth: l.nextMonth, showMore: l.showMore }}
          onSelect={(slug) => router.push(`/portal/events/${slug}`)}
        />
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border bg-muted">
            <CalendarIcon className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-lg text-foreground">{emptyTitle}</p>
            <p className="text-sm text-muted-foreground">{emptyBody}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              <h2 className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-1 font-semibold text-lg capitalize text-foreground backdrop-blur">
                {group.label}
              </h2>
              <ol className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <EventAgendaRow
                    key={item.event.id}
                    item={item}
                    locale={locale}
                    timeZone={timeZone}
                    past={window === "past"}
                    pendingFormCount={pendingForms[item.event.id] ?? 0}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
