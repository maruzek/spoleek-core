"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  LinkIcon,
  MailIcon,
  MoreHorizontalIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react";

import { EventAgendaRow } from "@/components/app/events/event-agenda-row";
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
import { PAST_EVENTS_CAP } from "@/lib/groups/portal-group-page";
import { formatMoney } from "@/lib/payments";
import { cn } from "@/lib/utils";
import type { PortalGroupDetail, PortalGroupRosterEntry } from "@/server/queries/portal-group-detail";
import type { PortalGroupPerson } from "@/server/queries/portal-groups";

/**
 * One group, for one member. The header is the page title; below it two
 * columns — what the group is doing (board, events, forms) and where the
 * member stands in it (standing, links, roster, leader tools). Visitors get
 * the left column trimmed to what they may see and no right column beyond
 * the links. Same cards, rows and stagger as the rest of the portal.
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
  const isMember = detail.access === "member";
  const hasAside = isMember || detail.resources.length > 0 || canManage;

  return (
    <div className="flex flex-1 flex-col pb-8">
      <Header detail={detail} canManage={canManage} />

      <div className={cn("grid gap-8", hasAside ? "max-w-6xl lg:grid-cols-[minmax(0,1fr)_20rem]" : "max-w-4xl")}>
        <div className="flex min-w-0 flex-col gap-10">
          {detail.announcement || canManage ? (
            <AnnouncementSection detail={detail} canManage={canManage} />
          ) : null}
          <EventsSection detail={detail} locale={locale} timeZone={timeZone} />
          <FormsSection detail={detail} />
        </div>

        {hasAside ? (
          <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
            {detail.standing ? <StandingCard detail={detail} locale={locale} /> : null}
            {detail.leaderPanel ? <LeaderPanel panel={detail.leaderPanel} /> : null}
            {detail.resources.length > 0 || canManage ? (
              <ResourcesCard detail={detail} canManage={canManage} />
            ) : null}
            {detail.roster ? <RosterCard roster={detail.roster} /> : null}
          </aside>
        ) : null}
      </div>
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

function EventsSection({
  detail,
  locale,
  timeZone,
}: {
  detail: PortalGroupDetail;
  locale: string;
  timeZone: string;
}) {
  const t = useDictionary().portalGroupPage;
  const { upcoming, alsoInvited, past } = detail.events;
  const [showAllPast, setShowAllPast] = useState(false);
  const visiblePast = showAllPast ? past : past.slice(0, PAST_EVENTS_CAP);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <SectionHeading count={upcoming.length}>{t.upcoming}</SectionHeading>
        {upcoming.length === 0 ? (
          <EmptyRow icon={<CalendarIcon className="size-4" aria-hidden />}>{t.nothingUpcoming}</EmptyRow>
        ) : (
          <ol className="flex flex-col gap-2">
            {upcoming.map((item) => (
              <EventAgendaRow key={item.event.id} item={item} locale={locale} timeZone={timeZone} />
            ))}
          </ol>
        )}
      </div>

      {alsoInvited.length > 0 ? (
        <div>
          <SectionHeading count={alsoInvited.length} hint={t.alsoInvitedHint}>
            {t.alsoInvited}
          </SectionHeading>
          <ol className="flex flex-col gap-2">
            {alsoInvited.map((item) => (
              <EventAgendaRow key={item.event.id} item={item} locale={locale} timeZone={timeZone} />
            ))}
          </ol>
        </div>
      ) : null}

      {past.length > 0 ? (
        <div>
          <SectionHeading
            count={past.length}
            hint={
              past.length > PAST_EVENTS_CAP ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-2 text-muted-foreground"
                  aria-expanded={showAllPast}
                  onClick={() => setShowAllPast((value) => !value)}
                >
                  {showAllPast ? t.showFewer : t.showAll(past.length)}
                </Button>
              ) : undefined
            }
          >
            {t.pastEvents}
          </SectionHeading>
          <ol className="flex flex-col gap-2 opacity-80">
            {visiblePast.map((item) => (
              <EventAgendaRow key={item.event.id} item={item} locale={locale} timeZone={timeZone} past />
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

// ─── Forms ──────────────────────────────────────────────────────────────────

function FormsSection({ detail }: { detail: PortalGroupDetail }) {
  const t = useDictionary().portalGroupPage;
  const { open, past } = detail.forms;
  if (open.length === 0 && past.length === 0) return null;

  return (
    <section className="flex flex-col gap-6">
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
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  index: number;
  children: ReactNode;
}) {
  const r = reveal(index);
  return (
    <section
      className={cn("rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10", r.className)}
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
    <AsideCard title={t.roster} count={roster.length} index={4}>
      <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <UsersIcon className="size-3.5" aria-hidden />
        {t.rosterHint}
      </p>
      <ul className="flex flex-col gap-2">
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
