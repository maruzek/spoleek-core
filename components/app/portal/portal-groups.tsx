"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  MoreHorizontalIcon,
  ShieldIcon,
} from "lucide-react";

import { useDictionary, useFormatters } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CopyButton } from "@/components/app/copy-button";
import { ListRow, reveal, } from "@/components/app/dashboard/dashboard-primitives";
import { PageSectionHeader } from "@/components/app/page-section";
import { AvailableActionSlot, LeaveMenuItem } from "@/components/app/portal/portal-group-actions";
import { cn } from "@/lib/utils";
import type {
  PortalAvailableGroup,
  PortalGroup,
  PortalGroupCategory,
  PortalGroupPerson,
  PortalGroupsData,
} from "@/server/queries/portal-groups";

// ─── Shared bits ────────────────────────────────────────────────────────────

function Leaders({ leaders }: { leaders: PortalGroupPerson[] }) {
  const t = useDictionary().portalGroups;

  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">
        {leaders.length === 1 ? t.leader : t.leaders}
      </dt>
      <dd className="flex min-w-0 flex-col items-end gap-0.5 text-right">
        {leaders.length === 0 ? (
          <span className="text-muted-foreground">{t.notAssignedYet}</span>
        ) : (
          leaders.map((leader) => (
            <span key={leader.id} className="flex max-w-full items-center gap-2">
              <span className={cn("truncate", leader.isYou && "text-primary")}>
                {leader.name}
                {leader.isYou ? ` ${t.you}` : ""}
              </span>
              {leader.email && !leader.isYou ? (
                <CopyButton
                  value={leader.email}
                  iconOnly
                  label={t.copyEmailOf(leader.name)}
                  className="-my-1 size-6 shrink-0 text-muted-foreground"
                />
              ) : null}
            </span>
          ))
        )}
      </dd>
    </div>
  );
}

// ─── One group of mine ──────────────────────────────────────────────────────

function GroupCard({ group, index }: { group: PortalGroup; index: number }) {
  const t = useDictionary().portalGroups;
  const { formatDateTime } = useFormatters();
  const r = reveal(index);

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10",
        r.className,
      )}
      style={r.style}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-sans text-base font-semibold text-foreground">
            <Link
              href={`/portal/groups/${group.slug}`}
              className="group/name inline-flex max-w-full items-center gap-1.5 hover:underline"
            >
              <span className="truncate">{group.name}</span>
              <ArrowRightIcon
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover/name:translate-x-0.5 group-hover/name:text-muted-foreground"
              />
            </Link>
          </h3>
          {group.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{group.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {group.role === "group_admin" ? (
            <Badge variant="secondary">
              <ShieldIcon data-icon="inline-start" />
              {t.youLeadThis}
            </Badge>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1.5 -mt-1 text-muted-foreground" aria-label={t.moreActions}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <LeaveMenuItem group={group} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {group.notices.length > 0 ? (
        <ul className="-mt-1 flex flex-col rounded-lg bg-muted/40 px-2">
          {group.notices.map((notice, noticeIndex) => (
            <ListRow
              key={notice.id}
              index={index + noticeIndex}
              href={notice.href}
              title={notice.title}
              meta={<span className="truncate">{notice.detail}</span>}
              urgent={notice.urgent}
            />
          ))}
        </ul>
      ) : null}

      <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        <Leaders leaders={group.leaders} />
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-xs text-muted-foreground">{t.nextUp}</dt>
          <dd className="min-w-0 text-right">
            {group.nextEvent ? (
              <Link
                href={`/portal/events/${group.nextEvent.slug}`}
                className="group inline-flex max-w-full items-center gap-1.5 hover:underline"
              >
                <CalendarDaysIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{group.nextEvent.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatDateTime(group.nextEvent.startsAt)}
                </span>
                <ArrowRightIcon
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                />
              </Link>
            ) : (
              <span className="text-muted-foreground">{t.nothingPlanned}</span>
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}

// ─── One group I could join ─────────────────────────────────────────────────

/**
 * Lighter than an own-group card on purpose: dashed ring, no notices or next
 * event, one action area. Pending and declined cards carry a tinted edge so a
 * request in flight reads at a glance among the ones still open.
 */
function AvailableGroupCard({ group, index }: { group: PortalAvailableGroup; index: number }) {
  const r = reveal(index);
  const kind = group.action.kind;

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-dashed border-foreground/20 bg-card/60 p-4 text-card-foreground",
        kind === "pending" && "border-solid border-orange-400/60 bg-orange-50/40 dark:bg-orange-950/20",
        kind === "declined" && "border-solid border-foreground/10 bg-muted/30",
        r.className,
      )}
      style={r.style}
    >
      <div className="min-w-0">
        <h3 className="truncate font-sans text-base font-semibold text-foreground">
          {group.canOpenPage ? (
            <Link
              href={`/portal/groups/${group.slug}`}
              className="group/name inline-flex max-w-full items-center gap-1.5 hover:underline"
            >
              <span className="truncate">{group.name}</span>
              <ArrowRightIcon
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover/name:translate-x-0.5 group-hover/name:text-muted-foreground"
              />
            </Link>
          ) : (
            group.name
          )}
        </h3>
        {group.description ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{group.description}</p>
        ) : null}
      </div>

      {group.leaders.length > 0 || kind === "ask_leader" ? (
        <dl className="flex flex-col gap-1.5 text-sm">
          <Leaders leaders={group.leaders} />
        </dl>
      ) : null}

      <div className="mt-auto border-t border-dashed border-border pt-3">
        <AvailableActionSlot group={group} action={group.action} />
      </div>
    </li>
  );
}

// ─── One category ───────────────────────────────────────────────────────────

function CategorySection({
  category,
  startIndex,
}: {
  category: PortalGroupCategory;
  startIndex: number;
}) {
  const t = useDictionary().portalGroups;
  const single = category.selectionMode === "single";
  const canPick = category.available.some(
    (group) => group.action.kind === "join" || group.action.kind === "request",
  );

  return (
    <section>
      <PageSectionHeader count={category.mine.length} hint={category.description ?? undefined} title={category.name} />
      {category.mine.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
          {t.notInAny(category.name, single)} {canPick ? t.pickOneBelow : t.askAdmin}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {category.mine.map((group, index) => (
            <GroupCard key={group.id} group={group} index={startIndex + index} />
          ))}
        </ul>
      )}

      {category.available.length > 0 ? (
        <div className="mt-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="font-sans text-sm font-semibold text-muted-foreground">{t.availableHeading}</h3>
            <span className="text-xs text-muted-foreground">{t.availableHint(single)}</span>
          </div>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {category.available.map((group, index) => (
              <AvailableGroupCard
                key={group.id}
                group={group}
                index={startIndex + Math.max(category.mine.length, 1) + index}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ─── Page body ──────────────────────────────────────────────────────────────

/** Cards a category occupies in the reveal sequence: its own, its available, or the one empty note. */
function cardCount(category: PortalGroupCategory) {
  return Math.max(category.mine.length, 1) + category.available.length;
}

export function PortalGroups({ data }: { data: PortalGroupsData }) {
  const t = useDictionary().portalGroups;

  if (data.categories.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        {t.noGroupsYet}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {data.categories.map((category, categoryIndex) => (
        <CategorySection
          key={category.id}
          category={category}
          startIndex={data.categories.slice(0, categoryIndex).reduce((sum, c) => sum + cardCount(c), 0)}
        />
      ))}
    </div>
  );
}
