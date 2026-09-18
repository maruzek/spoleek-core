"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownNarrowWideIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpNarrowWideIcon,
  CalendarIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  LayoutDashboardIcon,
  LinkIcon,
  MailIcon,
  MoreHorizontalIcon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react";

import { EventAgendaRow, type EventOutcome, eventOutcomeOf } from "@/components/app/events/event-agenda-row";
import { StatusFilter, type StatusFilterOption } from "@/components/app/status-filter";
import { PortalFormCard } from "@/components/app/forms/portal-form-card";
import { ListRow, reveal, SectionHeading } from "@/components/app/dashboard/dashboard-primitives";
import { GroupAnnouncementEditor } from "@/components/app/portal/group-announcement-editor";
import { GroupResourcesEditor } from "@/components/app/portal/group-resources-editor";
import { AvailableActionSlot, LeaveMenuItem } from "@/components/app/portal/portal-group-actions";
import { useDictionary, useFormatters } from "@/components/locale-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PAST_EVENTS_CAP } from "@/lib/groups/portal-group-page";
import { formatMoney } from "@/lib/payments";
import { matchesSearch } from "@/lib/search";
import { STATUS_DOT_CLASSES } from "@/lib/status-dot";
import { cn } from "@/lib/utils";
import type {
  GroupEventItem,
  PortalGroupDetail,
  PortalGroupRosterEntry,
} from "@/server/queries/portal-group-detail";
import type { PortalGroupPerson } from "@/server/queries/portal-groups";

/**
 * One group, for one member. The header is the page title; under it four
 * tabs — Overview (board, standing, links, leader tools), Events (with the
 * now / upcoming / past split and the agenda's filters), Forms, and Members
 * when the org shows rosters. Visitors see the same tabs trimmed to what
 * they may see. Same cards, rows and stagger as the rest of the portal.
 */
export function PortalGroupPage({
  detail,
  locale,
  timeZone,
  canManage,
}: {
  detail: PortalGroupDetail;
  locale: string;
  timeZone: string;
  canManage: boolean;
}) {
  const t = useDictionary().portalGroupPage;
  const liveEvents = detail.events.upcoming.length + detail.events.alsoInvited.length;
  const openForms = detail.forms.open.length;
  const hasForms = openForms + detail.forms.past.length > 0;

  return (
    <div className="flex flex-1 flex-col pb-8">
      <Header detail={detail} canManage={canManage} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboardIcon data-icon="inline-start" />
            {t.tabs.overview}
          </TabsTrigger>
          <TabsTrigger value="events">
            <CalendarIcon data-icon="inline-start" />
            {t.tabs.events}
            <TabCount count={liveEvents} />
          </TabsTrigger>
          {hasForms ? (
            <TabsTrigger value="forms">
              <ClipboardListIcon data-icon="inline-start" />
              {t.tabs.forms}
              <TabCount count={openForms} accent={openForms > 0} />
            </TabsTrigger>
          ) : null}
          {detail.roster ? (
            <TabsTrigger value="members">
              <UsersIcon data-icon="inline-start" />
              {t.tabs.members}
              <TabCount count={detail.roster.length} />
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <OverviewTab detail={detail} locale={locale} canManage={canManage} />
        </TabsContent>
        <TabsContent value="events" className="pt-4">
          <EventsTab detail={detail} locale={locale} timeZone={timeZone} />
        </TabsContent>
        {hasForms ? (
          <TabsContent value="forms" className="pt-4">
            <FormsSection detail={detail} />
          </TabsContent>
        ) : null}
        {detail.roster ? (
          <TabsContent value="members" className="pt-4">
            <RosterCard roster={detail.roster} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function TabCount({ count, accent = false }: { count: number; accent?: boolean }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "ml-1.5 text-xs tabular-nums",
        accent ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────

/**
 * The board stretches across the top; below it the member's own cards sit in
 * a row. A visitor with no links and no standing sees only the board (or,
 * with nothing posted, the empty note), so the tab never renders blank.
 */
function OverviewTab({
  detail,
  locale,
  canManage,
}: {
  detail: PortalGroupDetail;
  locale: string;
  canManage: boolean;
}) {
  const cards = [
    detail.standing ? <StandingCard key="standing" detail={detail} locale={locale} /> : null,
    detail.leaderPanel ? <LeaderPanel key="leader" panel={detail.leaderPanel} /> : null,
    detail.resources.length > 0 || canManage ? (
      <ResourcesCard key="resources" detail={detail} canManage={canManage} />
    ) : null,
  ].filter(Boolean);

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <AnnouncementSection detail={detail} canManage={canManage} />
      {cards.length > 0 ? (
        <div className={cn("grid gap-4", cards.length > 1 && "md:grid-cols-2", cards.length > 2 && "xl:grid-cols-3")}>
          {cards}
        </div>
      ) : null}
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────────

function Header({ detail, canManage }: { detail: PortalGroupDetail; canManage: boolean }) {
  const t = useDictionary().portalGroupPage;
  const tg = useDictionary().portalGroups;
  const { group, standing, leaders } = detail;

  return (
    <header className="flex flex-col gap-4 pb-6 md:pb-8">
      <Link
        href="/portal/groups"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        {t.allGroups}
        <span aria-hidden>·</span>
        <span className="normal-case tracking-normal">{group.categoryName}</span>
      </Link>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{group.name}</h1>
            {standing?.role === "group_admin" ? (
              <Badge variant="secondary">
                <ShieldIcon data-icon="inline-start" />
                {t.youLead}
              </Badge>
            ) : standing ? (
              <Badge variant="outline">{t.member}</Badge>
            ) : null}
          </div>
          {group.description ? (
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{group.description}</p>
          ) : null}
          <LeaderLine leaders={leaders} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {standing ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label={tg.moreActions}>
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <LeaveMenuItem
                  group={{
                    id: group.id,
                    name: group.name,
                    canLeave: standing.canLeave,
                    leaveBlockedReason: standing.leaveBlockedReason,
                    role: standing.role,
                    isLastAdmin: standing.isLastAdmin,
                  }}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : detail.action ? (
            <AvailableActionSlot
              group={{ id: group.id, name: group.name, joinPolicy: group.joinPolicy, leaders }}
              action={detail.action}
            />
          ) : null}
          {canManage && detail.leaderPanel ? (
            <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
              <Link href={detail.leaderPanel.adminHref}>
                {t.manageInAdmin}
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function LeaderLine({ leaders }: { leaders: PortalGroupPerson[] }) {
  const tg = useDictionary().portalGroups;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
        {leaders.length === 1 ? tg.leader : tg.leaders}
      </span>
      {leaders.length === 0 ? (
        <span>{tg.notAssignedYet}</span>
      ) : (
        leaders.map((leader, index) => (
          <span key={leader.id} className="inline-flex items-center gap-1">
            {index > 0 ? <span aria-hidden className="mr-1 text-muted-foreground/50">·</span> : null}
            <span className={cn("text-foreground", leader.isYou && "text-primary")}>
              {leader.name}
              {leader.isYou ? ` ${tg.you}` : ""}
            </span>
            {leader.email && !leader.isYou ? (
              <a
                href={`mailto:${leader.email}`}
                aria-label={tg.writeTo(leader.name)}
                title={leader.email}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <MailIcon className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </span>
        ))
      )}
    </p>
  );
}

// ─── Notice board ───────────────────────────────────────────────────────────

function AnnouncementSection({ detail, canManage }: { detail: PortalGroupDetail; canManage: boolean }) {
  const t = useDictionary().portalGroupPage;
  const { formatDate } = useFormatters();
  const { announcement } = detail;
  const r = reveal(0);

  return (
    <section>
      <SectionHeading
        hint={
          canManage ? (
            <GroupAnnouncementEditor groupId={detail.group.id} initialHtml={announcement?.html ?? ""} />
          ) : undefined
        }
      >
        {t.announcement}
      </SectionHeading>
      {announcement ? (
        <article
          className={cn(
            "rounded-xl border-l-4 border-primary/60 bg-card px-5 py-4 text-card-foreground ring-1 ring-foreground/10",
            r.className,
          )}
          style={r.style}
        >
          <div
            className="policy-prose"
            // Sanitized on write by server/lib/policy-html.ts; rendered verbatim.
            dangerouslySetInnerHTML={{ __html: announcement.html }}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            {t.announcementBy(formatDate(announcement.updatedAt), announcement.updatedBy)}
          </p>
        </article>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
          {t.announcementEmpty}
        </p>
      )}
    </section>
  );
}

// ─── Events ─────────────────────────────────────────────────────────────────

type EventWindow = "now" | "upcoming" | "past";
type EventSource = "all" | "owned" | "invited";
type EventSort = "soonest" | "latest";

/** An event that has started and is not over yet. */
function isRunning(item: GroupEventItem, now: Date) {
  const start = item.event.startsAt;
  return start != null && start <= now;
}

function startMs(item: GroupEventItem) {
  return item.event.startsAt ? item.event.startsAt.getTime() : null;
}

/**
 * The agenda's controls, scoped to one group: a now / upcoming / past window,
 * where the event comes from, the member's answer, search, and sort. The
 * buckets come pre-split by the server; the window split is done here because
 * "running" depends on the moment the page is looked at.
 */
function EventsTab({
  detail,
  locale,
  timeZone,
}: {
  detail: PortalGroupDetail;
  locale: string;
  timeZone: string;
}) {
  const dict = useDictionary();
  const t = dict.portalGroupPage;
  const te = dict.events;
  const { upcoming, alsoInvited, past } = detail.events;

  // One instant per mount: the split must not flicker between renders.
  const [now] = useState(() => new Date());
  const live = useMemo(() => [...upcoming, ...alsoInvited], [upcoming, alsoInvited]);
  const running = useMemo(() => live.filter((item) => isRunning(item, now)), [live, now]);
  const ahead = useMemo(() => live.filter((item) => !isRunning(item, now)), [live, now]);

  const [window, setWindow] = useState<EventWindow>(running.length > 0 ? "now" : "upcoming");
  const [source, setSource] = useState<EventSource>("all");
  const [sort, setSort] = useState<EventSort>("soonest");
  const [query, setQuery] = useState("");
  const [showAllPast, setShowAllPast] = useState(false);

  const outcomeOptions = useMemo<StatusFilterOption<EventOutcome>[]>(
    () => [
      { value: "pending", label: te.list.needsAnswer, dotClassName: "bg-amber-500" },
      { value: "going", label: te.answer.yes, dotClassName: STATUS_DOT_CLASSES.success },
      { value: "reserve", label: te.detail.yourStatus.reserve, dotClassName: STATUS_DOT_CLASSES.warning },
      { value: "maybe", label: te.answer.maybe, dotClassName: STATUS_DOT_CLASSES.info },
      { value: "no", label: te.answer.no, dotClassName: STATUS_DOT_CLASSES.default },
    ],
    [te],
  );
  const [outcomes, setOutcomes] = useState<EventOutcome[]>(() => outcomeOptions.map((o) => o.value));

  const pool = window === "now" ? running : window === "upcoming" ? ahead : past;
  const rows = useMemo(() => {
    const filtered = pool
      .filter((item) => source === "all" || item.relation === source)
      .filter((item) => outcomes.includes(eventOutcomeOf(item)))
      .filter((item) =>
        matchesSearch(
          [item.event.title, item.event.locationName ?? "", item.event.locationAddress ?? "", item.ownerName ?? ""].join(
            " ",
          ),
          query,
        ),
      );
    // Undated events sit at the end whichever way the list runs.
    return [...filtered].sort((a, b) => {
      const x = startMs(a);
      const y = startMs(b);
      if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
      return sort === "soonest" ? x - y : y - x;
    });
  }, [pool, source, outcomes, query, sort]);

  const filtered = query.trim().length > 0 || source !== "all" || outcomes.length !== outcomeOptions.length;
  const capped = window === "past" && !showAllPast && rows.length > PAST_EVENTS_CAP;
  const visible = capped ? rows.slice(0, PAST_EVENTS_CAP) : rows;
  // Visitors never receive past events, so the toggle would be a dead end.
  const windows: EventWindow[] = detail.access === "member" ? ["now", "upcoming", "past"] : ["now", "upcoming"];
  const windowCount: Record<EventWindow, number> = { now: running.length, upcoming: ahead.length, past: past.length };
  const windowLabel: Record<EventWindow, string> = { now: t.now, upcoming: t.upcoming, past: t.pastEvents };
  const empty = filtered
    ? t.noMatch
    : window === "now"
      ? t.nothingNow
      : window === "upcoming"
        ? t.nothingUpcoming
        : t.nothingPast;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={window}
          onValueChange={(v) => v && setWindow(v as EventWindow)}
          aria-label={t.events}
        >
          {windows.map((value) => (
            <ToggleGroupItem key={value} value={value} className="gap-1.5 px-3">
              {value === "now" && running.length > 0 ? (
                <span className="relative flex size-2 shrink-0" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
              ) : null}
              {windowLabel[value]}
              <span className="text-xs tabular-nums text-muted-foreground">{windowCount[value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {alsoInvited.length > 0 && window !== "past" ? (
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={source}
            onValueChange={(v) => v && setSource(v as EventSource)}
            aria-label={t.sourceLabel}
          >
            <ToggleGroupItem value="all" className="px-3">
              {t.sourceAll}
            </ToggleGroupItem>
            <ToggleGroupItem value="owned" className="px-3">
              {t.sourceOwned}
            </ToggleGroupItem>
            <ToggleGroupItem value="invited" className="px-3">
              {t.sourceInvited}
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}

        <StatusFilter
          options={outcomeOptions}
          value={outcomes}
          onChange={setOutcomes}
          label={t.answerLabel}
          ariaLabel={t.answerLabel}
          className="min-w-40"
        />

        <Button
          variant="outline"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setSort((value) => (value === "soonest" ? "latest" : "soonest"))}
          aria-label={sort === "soonest" ? t.sortSoonest : t.sortLatest}
          title={sort === "soonest" ? t.sortSoonest : t.sortLatest}
        >
          {sort === "soonest" ? <ArrowUpNarrowWideIcon /> : <ArrowDownNarrowWideIcon />}
        </Button>

        <InputGroup className="ml-auto w-full sm:w-64">
          <InputGroupAddon>
            <SearchIcon className="size-4" aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchEvents}
            aria-label={t.searchEvents}
          />
        </InputGroup>
      </div>

      {rows.length === 0 ? (
        <EmptyRow icon={<CalendarIcon className="size-4" aria-hidden />}>{empty}</EmptyRow>
      ) : (
        <ol className={cn("flex flex-col gap-2", window === "past" && "opacity-80")}>
          {visible.map((item) => (
            <EventAgendaRow
              key={item.event.id}
              item={item}
              locale={locale}
              timeZone={timeZone}
              past={window === "past"}
              extraBadges={
                item.relation === "invited" ? (
                  <Badge variant="secondary" title={item.ownerName ?? undefined}>
                    {t.invitedBadge}
                  </Badge>
                ) : null
              }
            />
          ))}
        </ol>
      )}

      {window === "past" && rows.length > PAST_EVENTS_CAP ? (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            aria-expanded={showAllPast}
            onClick={() => setShowAllPast((value) => !value)}
          >
            {showAllPast ? t.showFewer : t.showAll(rows.length)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ─── Forms ──────────────────────────────────────────────────────────────────

function FormsSection({ detail }: { detail: PortalGroupDetail }) {
  const t = useDictionary().portalGroupPage;
  const { open, past } = detail.forms;

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <div>
        <SectionHeading count={open.length}>{t.forms}</SectionHeading>
        {open.length === 0 ? (
          <EmptyRow icon={<ClipboardListIcon className="size-4" aria-hidden />}>{t.noForms}</EmptyRow>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((item) => (
              <PortalFormCard key={item.form.id} item={item} hideEvent />
            ))}
          </ul>
        )}
      </div>
      {past.length > 0 ? (
        <div>
          <SectionHeading count={past.length}>{t.answeredForms}</SectionHeading>
          <ul className="flex flex-col gap-2 opacity-80">
            {past.map((item) => (
              <PortalFormCard key={item.form.id} item={item} hideEvent />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ─── Aside cards ────────────────────────────────────────────────────────────

function AsideCard({
  title,
  count,
  action,
  index,
  className,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const r = reveal(index);
  return (
    <section
      className={cn("rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10", r.className, className)}
      style={r.style}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-baseline gap-2 font-sans text-sm font-semibold text-foreground">
          {title}
          {count != null && count > 0 ? (
            <span className="text-xs font-normal tabular-nums text-muted-foreground">{count}</span>
          ) : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

function StandingCard({ detail, locale }: { detail: PortalGroupDetail; locale: string }) {
  const t = useDictionary().portalGroupPage;
  const { formatDate } = useFormatters();
  const standing = detail.standing!;

  return (
    <AsideCard title={t.standing} index={1}>
      <dl className="flex flex-col gap-1.5">
        <Fact label={t.role}>{standing.role === "group_admin" ? t.leaderRole : t.memberRole}</Fact>
        <Fact label={t.since}>
          <span className="tabular-nums">{formatDate(standing.memberSince)}</span>
        </Fact>
        {standing.fee ? (
          <Fact label={t.fee}>
            <span className="tabular-nums">{formatMoney(standing.fee.amount, standing.fee.currency, locale)}</span>
            <span className="block text-xs text-muted-foreground">
              {standing.fee.payment ? (
                <Link
                  href={standing.fee.payment.href}
                  className={cn(
                    "hover:underline",
                    standing.fee.payment.status === "overdue" && "text-destructive",
                    standing.fee.payment.status === "pending" && "text-amber-700 dark:text-amber-500",
                  )}
                >
                  {t.feeStatus[standing.fee.payment.status] ?? standing.fee.payment.status}
                </Link>
              ) : standing.fee.nextRenewal ? (
                t.feeRenews(formatDate(standing.fee.nextRenewal))
              ) : null}
            </span>
          </Fact>
        ) : null}
      </dl>

      {standing.notices.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.needsYou}</h3>
          <ul className="flex flex-col">
            {standing.notices.map((notice, index) => (
              <ListRow
                key={notice.id}
                index={index}
                href={notice.href}
                title={notice.title}
                meta={<span className="truncate">{notice.detail}</span>}
                urgent={notice.urgent}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </AsideCard>
  );
}

function LeaderPanel({ panel }: { panel: NonNullable<PortalGroupDetail["leaderPanel"]> }) {
  const t = useDictionary().portalGroupPage;

  return (
    <AsideCard title={t.leaderTools} index={2}>
      <ul className="flex flex-col">
        <ListRow
          index={0}
          href={panel.adminHref}
          title={t.pendingRequests(panel.pendingRequests)}
          meta={<span>{t.memberCount(panel.memberCount)}</span>}
          urgent={panel.pendingRequests > 0 ? "warning" : null}
        />
      </ul>
      <Button asChild variant="outline" size="sm" className="mt-3 w-full">
        <Link href={panel.adminHref}>
          {t.manageInAdmin}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
    </AsideCard>
  );
}

function ResourcesCard({ detail, canManage }: { detail: PortalGroupDetail; canManage: boolean }) {
  const t = useDictionary().portalGroupPage;

  return (
    <AsideCard
      title={t.resources}
      count={detail.resources.length}
      index={3}
      action={canManage ? <GroupResourcesEditor groupId={detail.group.id} resources={detail.resources} /> : null}
    >
      {detail.resources.length === 0 ? (
        <p className="text-sm text-muted-foreground">{canManage ? t.noResourcesManager : t.noResources}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {detail.resources.map((resource, index) => {
            const r = reveal(index);
            const external = !resource.url.startsWith("mailto:");
            return (
              <li key={resource.id} className={r.className} style={r.style}>
                <a
                  href={resource.url}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
                >
                  {external ? (
                    <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <MailIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{resource.label}</span>
                  <ExternalLinkIcon
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover:text-muted-foreground"
                  />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </AsideCard>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function RosterCard({ roster }: { roster: PortalGroupRosterEntry[] }) {
  const t = useDictionary().portalGroupPage;

  return (
    <AsideCard title={t.roster} count={roster.length} index={0} className="max-w-4xl">
      <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <UsersIcon className="size-3.5" aria-hidden />
        {t.rosterHint}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {roster.map((person, index) => {
          const r = reveal(index);
          return (
            <li key={person.id} className={cn("flex items-center gap-2.5", r.className)} style={r.style}>
              <Avatar size="sm">
                {person.image ? <AvatarImage src={person.image} alt="" /> : null}
                <AvatarFallback>{initials(person.name) || "?"}</AvatarFallback>
              </Avatar>
              <span className={cn("min-w-0 flex-1 truncate text-sm", person.isYou && "text-primary")}>
                {person.name}
                {person.isYou ? ` ${t.you}` : ""}
              </span>
              {person.role === "group_admin" ? (
                <Badge variant="secondary" className="shrink-0">
                  <ShieldIcon data-icon="inline-start" />
                  {t.leaderBadge}
                </Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
    </AsideCard>
  );
}

function EmptyRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}
