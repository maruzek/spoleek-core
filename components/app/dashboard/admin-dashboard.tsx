"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  BookOpenIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  FolderTreeIcon,
  MailIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";

import { useFormatLocale } from "@/components/locale-provider";
import {
  Stat,
  StatDescription,
  StatGroup,
  StatIndicator,
  StatLabel,
  StatValue,
} from "@/components/ui/stat";
import {
  AllClear,
  DayHeading,
  EmptyNote,
  ListRow,
  ScrollList,
  SectionHeading,
  relativeTime,
  reveal,
  rowLink,
} from "@/components/app/dashboard/dashboard-primitives";
import {
  daysUntil,
  groupByDay,
  type ActivityItem,
  type AdminDashboardData,
  type AttentionItem,
  type DashboardModule,
  type ModuleTile,
  type UpcomingItem,
} from "@/lib/dashboard";

const MODULE_ICONS: Record<DashboardModule, typeof UsersIcon> = {
  members: UsersIcon,
  groups: FolderTreeIcon,
  events: CalendarDaysIcon,
  forms: BookOpenIcon,
  payments: CreditCardIcon,
  reports: ClipboardCheckIcon,
  email: MailIcon,
  settings: Settings2Icon,
};

const MODULE_LABELS: Record<DashboardModule, string> = {
  members: "Members",
  groups: "Groups",
  events: "Events",
  forms: "Forms",
  payments: "Payments",
  reports: "Reports",
  email: "Email",
  settings: "Settings",
};

// ─── Needs you ──────────────────────────────────────────────────────────────

function waitingLabel(item: AttentionItem, now: Date) {
  if (!item.waitingSince) return null;
  const days = -daysUntil(item.waitingSince, now);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function AttentionSection({ items, now }: { items: AttentionItem[]; now: Date }) {
  return (
    <section>
      <SectionHeading count={items.length}>Needs you</SectionHeading>
      {items.length === 0 ? (
        <AllClear
          title="Nothing is waiting on you."
          detail="No requests, no overdue fees, no failed deliveries."
        />
      ) : (
        <ScrollList>
          <ul className="flex flex-col">
            {items.map((item, index) => {
              const Icon = MODULE_ICONS[item.module];
              const waiting = waitingLabel(item, now);
              return (
                <ListRow
                  key={item.id}
                  index={index}
                  href={item.href}
                  title={item.title}
                  urgent={item.urgent ? (item.tone === "danger" ? "error" : "warning") : null}
                  meta={
                    <>
                      <Icon className="size-3 shrink-0" aria-hidden />
                      {MODULE_LABELS[item.module]}
                      {waiting ? <span className="tabular-nums"> · {waiting}</span> : null}
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

const UPCOMING_KIND_LABEL: Record<UpcomingItem["kind"], string> = {
  event: "Event",
  rsvp_deadline: "RSVP deadline",
  payment_due: "Payment due",
  form_closes: "Form closes",
  report_due: "Report deadline",
  fee_renewal: "Fee renewal",
  member_purge: "Retention",
};

const ALL_DAY_KINDS = new Set<UpcomingItem["kind"]>([
  "fee_renewal",
  "report_due",
  "payment_due",
  "member_purge",
]);

function UpcomingSection({
  items,
  now,
  startIndex,
}: {
  items: UpcomingItem[];
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
      <SectionHeading count={items.length} hint="next 14 days">
        Coming up
      </SectionHeading>
      {days.length === 0 ? (
        <EmptyNote>Nothing scheduled in the next two weeks.</EmptyNote>
      ) : (
        <ScrollList>
          <ol className="flex flex-col gap-4">
            {days.map((day, dayIndex) => (
              <li key={day.dayOffset}>
                <DayHeading dayOffset={day.dayOffset} date={day.date} locale={locale} />
                <ul className="flex flex-col">
                  {day.items.map((item, itemIndex) => {
                    const Icon = MODULE_ICONS[item.module];
                    const r = reveal(startIndex + dayIndex + itemIndex);
                    return (
                      <li key={item.id} className={r.className} style={r.style}>
                        <Link href={item.href} className={rowLink}>
                          <span className="w-11 shrink-0 pt-px text-xs tabular-nums text-muted-foreground">
                            {ALL_DAY_KINDS.has(item.kind) ? "all day" : timeFormat.format(item.at)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                              <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="truncate">{item.title}</span>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {UPCOMING_KIND_LABEL[item.kind]} · {item.detail}
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

// ─── Just happened ──────────────────────────────────────────────────────────

function ActivitySection({
  items,
  now,
  startIndex,
}: {
  items: ActivityItem[];
  now: Date;
  startIndex: number;
}) {
  const locale = useFormatLocale();

  return (
    <section>
      <SectionHeading count={items.length} hint="last 7 days">
        Just happened
      </SectionHeading>
      {items.length === 0 ? (
        <EmptyNote>A quiet week. Nothing new came in.</EmptyNote>
      ) : (
        <ScrollList>
          <ul className="flex flex-col">
            {items.map((item, index) => {
              const Icon = MODULE_ICONS[item.module];
              return (
                <ListRow
                  key={item.id}
                  index={startIndex + index}
                  href={item.href}
                  title={item.title}
                  meta={
                    <>
                      <Icon className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{item.detail}</span>
                    </>
                  }
                  trailing={
                    <time
                      dateTime={item.at.toISOString()}
                      className="shrink-0 pt-0.5 text-xs whitespace-nowrap tabular-nums text-muted-foreground"
                    >
                      {relativeTime(item.at, now, locale, daysUntil(item.at, now))}
                    </time>
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

// ─── Modules ────────────────────────────────────────────────────────────────

function ModuleStat({ tile, index }: { tile: ModuleTile; index: number }) {
  const Icon = MODULE_ICONS[tile.key];
  const r = reveal(index);
  return (
    <Stat asChild className={r.className} style={r.style}>
      <Link href={tile.href}>
        <StatLabel className="inline-flex items-center gap-2 text-foreground">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {tile.title}
        </StatLabel>
        {tile.alerts > 0 ? (
          <StatIndicator
            variant="badge"
            color="warning"
            aria-label={`${tile.alerts} items need attention`}
          >
            {tile.alerts}
          </StatIndicator>
        ) : null}
        {tile.stat ? (
          <>
            <StatValue className="text-2xl">{tile.stat.value}</StatValue>
            <StatDescription>{tile.stat.label}</StatDescription>
          </>
        ) : (
          <>
            <StatValue className="text-2xl text-muted-foreground/40">—</StatValue>
            <StatDescription>Open {tile.title.toLowerCase()}</StatDescription>
          </>
        )}
      </Link>
    </Stat>
  );
}

function ModulesSection({ tiles, startIndex }: { tiles: ModuleTile[]; startIndex: number }) {
  return (
    <section>
      <SectionHeading>Everything else</SectionHeading>
      <StatGroup columns={4}>
        {tiles.map((tile, index) => (
          <ModuleStat key={tile.key} tile={tile} index={startIndex + index} />
        ))}
      </StatGroup>
    </section>
  );
}

// ─── Page body ──────────────────────────────────────────────────────────────

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-3">
        <AttentionSection items={data.attention} now={data.now} />
        <UpcomingSection items={data.upcoming} now={data.now} startIndex={1} />
        <ActivitySection items={data.activity} now={data.now} startIndex={2} />
      </div>

      <ModulesSection tiles={data.modules} startIndex={3} />
    </div>
  );
}
