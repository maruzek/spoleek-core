"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  BookOpenIcon,
  CalendarDaysIcon,
  CheckIcon,
  CreditCardIcon,
  FolderTreeIcon,
  UserRoundIcon,
} from "lucide-react";

import { useFormatLocale, useFormatters } from "@/components/locale-provider";
import {
  AllClear,
  DayHeading,
  EmptyNote,
  ListRow,
  ScrollList,
  SectionHeading,
  reveal,
  rowLink,
} from "@/components/app/dashboard/dashboard-primitives";
import {
  Stat,
  StatDescription,
  StatGroup,
  StatIndicator,
  StatLabel,
  StatMeter,
  StatValue,
} from "@/components/ui/stat";
import { daysUntil, groupByDay } from "@/lib/dashboard";
import type {
  MembershipSummary,
  PortalArea,
  PortalDashboardData,
  PortalTile,
  PortalTodo,
  PortalUpcoming,
} from "@/lib/portal-dashboard";
import { cn } from "@/lib/utils";

const AREA_ICONS: Record<PortalArea, typeof UserRoundIcon> = {
  profile: UserRoundIcon,
  groups: FolderTreeIcon,
  events: CalendarDaysIcon,
  forms: BookOpenIcon,
  payments: CreditCardIcon,
};

// ─── To do ──────────────────────────────────────────────────────────────────

function dueLabel(todo: PortalTodo, now: Date) {
  if (!todo.dueAt) return null;
  const days = daysUntil(todo.dueAt, now);
  if (days < 0) return `${-days} ${days === -1 ? "day" : "days"} late`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

function TodoSection({ items, now }: { items: PortalTodo[]; now: Date }) {
  return (
    <section>
      <SectionHeading count={items.length}>To do</SectionHeading>
      {items.length === 0 ? (
        <AllClear title="You are all caught up." detail="Nothing to answer, nothing to pay." />
      ) : (
        <ScrollList>
          <ul className="flex flex-col">
            {items.map((item, index) => {
              const due = dueLabel(item, now);
              return (
                <ListRow
                  key={item.id}
                  index={index}
                  href={item.href}
                  title={item.title}
                  urgent={item.urgent ?? null}
                  meta={
                    <>
                      <span className="truncate">{item.detail}</span>
                      {due ? <span className="shrink-0 tabular-nums"> · {due}</span> : null}
                    </>
                  }
                />
              );
            })}
          </ul>
        </ScrollList>
      )}
    </section>
  );
}

// ─── Coming up ──────────────────────────────────────────────────────────────

const KIND_LABEL: Record<PortalUpcoming["kind"], string> = {
  event: "Event",
  rsvp_deadline: "Answer by",
  payment_due: "Payment due",
  form_closes: "Form closes",
};

function UpcomingSection({
  items,
  now,
  startIndex,
}: {
  items: PortalUpcoming[];
  now: Date;
  startIndex: number;
}) {
  const locale = useFormatLocale();
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
    [locale],
  );
  const days = useMemo(() => groupByDay(items, now), [items, now]);

  return (
    <section>
      <SectionHeading count={items.length} hint="next 30 days">
        Coming up
      </SectionHeading>
      {days.length === 0 ? (
        <EmptyNote>Nothing on your calendar for the next month.</EmptyNote>
      ) : (
        <ScrollList>
          <ol className="flex flex-col gap-4">
            {days.map((day, dayIndex) => (
              <li key={day.dayOffset}>
                <DayHeading dayOffset={day.dayOffset} date={day.date} locale={locale} />
                <ul className="flex flex-col">
                  {day.items.map((item, itemIndex) => {
                    const Icon = AREA_ICONS[item.area];
                    const r = reveal(startIndex + dayIndex + itemIndex);
                    return (
                      <li key={item.id} className={r.className} style={r.style}>
                        <Link href={item.href} className={rowLink}>
                          <span className="w-11 shrink-0 pt-px text-xs tabular-nums text-muted-foreground">
                            {item.kind === "payment_due" ? "all day" : timeFormat.format(item.at)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                              <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="truncate">{item.title}</span>
                              {item.answer === "yes" ? (
                                <CheckIcon
                                  className="size-3.5 shrink-0 text-primary"
                                  aria-label="You are going"
                                />
                              ) : null}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {KIND_LABEL[item.kind]}
                              {item.detail ? ` · ${item.detail}` : ""}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </ScrollList>
      )}
    </section>
  );
}

// ─── Your membership ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<MembershipSummary["status"], string> = {
  invited: "Invited",
  pending: "Awaiting approval",
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
  deleted: "Deleted",
};

const ROLE_LABEL: Record<MembershipSummary["role"], string> = {
  member: "Member",
  leader: "Leader",
  org_admin: "Organization admin",
};

const FEE_LABEL: Record<NonNullable<MembershipSummary["fee"]>["status"], string> = {
  paid: "Paid",
  pending: "Due",
  overdue: "Overdue",
  none: "Not issued yet",
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}

function MembershipSection({
  membership,
  orgName,
  startIndex,
}: {
  membership: MembershipSummary;
  orgName: string;
  startIndex: number;
}) {
  const { formatDate } = useFormatters();
  const r = reveal(startIndex);

  return (
    <section className={r.className} style={r.style}>
      <SectionHeading hint={orgName}>Your membership</SectionHeading>
      <ScrollList>
        <dl className="flex flex-col">
          <Fact label="Status">
            <span
              className={cn(
                membership.status === "active" ? "text-foreground" : "text-orange-600 dark:text-orange-400",
              )}
            >
              {STATUS_LABEL[membership.status]}
            </span>
          </Fact>
          <Fact label="Role">{ROLE_LABEL[membership.role]}</Fact>
          <Fact label="Member since">{formatDate(membership.memberSince)}</Fact>
          {membership.fee ? (
            <Fact label={membership.fee.label ? `Fee ${membership.fee.label}` : "Membership fee"}>
              <span
                className={cn(
                  membership.fee.status === "overdue" && "text-destructive",
                  membership.fee.status === "pending" && "text-orange-600 dark:text-orange-400",
                )}
              >
                {FEE_LABEL[membership.fee.status]}
              </span>
            </Fact>
          ) : null}
          <Fact label="We write to">
            <Link href="/portal/profile" className="hover:underline">
              {membership.contactEmail ?? "No address on file"}
            </Link>
          </Fact>
        </dl>

        <div className="mt-4">
          <h3 className="mb-1 font-sans text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            Groups
            {membership.groups.length > 0 ? (
              <span className="ml-2 font-normal normal-case tracking-normal">
                {membership.groups.length}
              </span>
            ) : null}
          </h3>
          {membership.groups.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">You are not in any group yet.</p>
          ) : (
            <ul className="flex flex-col">
              {membership.groups.map((group, index) => (
                <ListRow
                  key={group.id}
                  index={startIndex + 1 + index}
                  href="/portal/groups"
                  title={group.name}
                  meta={
                    <>
                      <span className="truncate">{group.categoryName}</span>
                      {group.isAdmin ? <span className="shrink-0"> · you manage this group</span> : null}
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </ScrollList>
    </section>
  );
}

// ─── Tiles ──────────────────────────────────────────────────────────────────

function AreaStat({
  tile,
  index,
  meter,
}: {
  tile: PortalTile;
  index: number;
  meter?: number;
}) {
  const Icon = AREA_ICONS[tile.key];
  const r = reveal(index);
  return (
    <Stat asChild className={r.className} style={r.style}>
      <Link href={tile.href}>
        <StatLabel className="inline-flex items-center gap-2 text-foreground">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {tile.title}
        </StatLabel>
        {tile.alerts > 0 ? (
          <StatIndicator variant="badge" color="warning" aria-label={`${tile.alerts} to do`}>
            {tile.alerts}
          </StatIndicator>
        ) : null}
        {tile.stat ? (
          <>
            <StatValue className="text-2xl">{tile.stat.value}</StatValue>
            <StatDescription>{tile.stat.label}</StatDescription>
          </>
        ) : null}
        {meter != null ? <StatMeter ratio={meter} /> : null}
      </Link>
    </Stat>
  );
}

// ─── Page body ──────────────────────────────────────────────────────────────

export function PortalDashboard({ data, orgName }: { data: PortalDashboardData; orgName: string }) {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-3">
        <TodoSection items={data.todos} now={data.now} />
        <UpcomingSection items={data.upcoming} now={data.now} startIndex={1} />
        <MembershipSection membership={data.membership} orgName={orgName} startIndex={2} />
      </div>

      <section>
        <SectionHeading>Your portal</SectionHeading>
        <StatGroup columns={5}>
          {data.tiles.map((tile, index) => (
            <AreaStat
              key={tile.key}
              tile={tile}
              index={4 + index}
              meter={tile.key === "profile" && data.completeness.total > 0 ? data.completeness.percent / 100 : undefined}
            />
          ))}
        </StatGroup>
      </section>
    </div>
  );
}
