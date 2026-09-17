"use client";

import Link from "next/link";
import { ArrowRightIcon, CalendarDaysIcon, MailIcon, ShieldIcon } from "lucide-react";

import { useFormatters } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { ListRow, reveal, SectionHeading } from "@/components/app/dashboard/dashboard-primitives";
import { cn } from "@/lib/utils";
import type {
  PortalGroup,
  PortalGroupCategory,
  PortalGroupsData,
} from "@/server/queries/portal-groups";

// ─── One group ──────────────────────────────────────────────────────────────

function GroupCard({ group, index }: { group: PortalGroup; index: number }) {
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
          <h3 className="truncate font-sans text-base font-semibold text-foreground">{group.name}</h3>
          {group.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{group.description}</p>
          ) : null}
        </div>
        {group.role === "group_admin" ? (
          <Badge variant="secondary" className="shrink-0">
            <ShieldIcon data-icon="inline-start" />
            You lead this
          </Badge>
        ) : null}
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
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-xs text-muted-foreground">
            {group.leaders.length === 1 ? "Leader" : "Leaders"}
          </dt>
          <dd className="flex min-w-0 flex-col items-end gap-0.5 text-right">
            {group.leaders.length === 0 ? (
              <span className="text-muted-foreground">Not assigned yet</span>
            ) : (
              group.leaders.map((leader) => (
                <span key={leader.id} className="flex max-w-full items-center gap-2">
                  <span className={cn("truncate", leader.isYou && "text-primary")}>
                    {leader.name}
                    {leader.isYou ? " (you)" : ""}
                  </span>
                  {leader.email && !leader.isYou ? (
                    <a
                      href={`mailto:${leader.email}`}
                      aria-label={`Write to ${leader.name}`}
                      title={leader.email}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <MailIcon className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </span>
              ))
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-xs text-muted-foreground">Next up</dt>
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
              <span className="text-muted-foreground">Nothing planned</span>
            )}
          </dd>
        </div>
      </dl>
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
  return (
    <section>
      <SectionHeading count={category.mine.length} hint={category.description ?? undefined}>
        {category.name}
      </SectionHeading>
      {category.mine.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
          You are not in {category.selectionMode === "single" ? "a" : "any"} {category.name} group.
          Groups are assigned by the organization — ask an admin if you think you belong in one.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {category.mine.map((group, index) => (
            <GroupCard key={group.id} group={group} index={startIndex + index} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Page body ──────────────────────────────────────────────────────────────

export function PortalGroups({ data }: { data: PortalGroupsData }) {
  if (data.categories.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        The organization has not set up any groups yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {data.categories.map((category, categoryIndex) => (
        <CategorySection
          key={category.id}
          category={category}
          startIndex={data.categories
            .slice(0, categoryIndex)
            .reduce((sum, c) => sum + Math.max(c.mine.length, 1), 0)}
        />
      ))}
    </div>
  );
}
