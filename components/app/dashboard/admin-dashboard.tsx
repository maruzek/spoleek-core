"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  CheckIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  FolderTreeIcon,
  MailIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";

import { useFormatLocale } from "@/components/locale-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Stat,
  StatDescription,
  StatGroup,
  StatIndicator,
  StatLabel,
  StatValue,
} from "@/components/ui/stat";
import { STATUS_DOT_CLASSES } from "@/lib/status-dot";
import { cn } from "@/lib/utils";
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

/** The three lists share one height so the top row reads as one band. */
const LIST_HEIGHT = "h-[22rem]";

/** Staggered entrance. Each row starts a beat after the previous one. */
function reveal(index: number) {
  return {
    className: "animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-400 ease-out",
    style: { animationDelay: `${Math.min(index, 10) * 40}ms` },
  };
}

function SectionHeading({
  children,
  count,
  hint,
}: {
  children: React.ReactNode;
  count?: number;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="flex items-baseline gap-2 font-sans text-base font-semibold text-foreground">
        {children}
        {count != null && count > 0 ? (
          <span className="text-sm font-normal tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </h2>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

const rowLink =
  "group -mx-2 flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

// ─── Needs you ──────────────────────────────────────────────────────────────

function waitingLabel(item: AttentionItem, now: Date) {
  if (!item.waitingSince) return null;
  const days = -daysUntil(item.waitingSince, now);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function AttentionRow({ item, now, index }: { item: AttentionItem; now: Date; index: number }) {
  const Icon = MODULE_ICONS[item.module];
  const waiting = waitingLabel(item, now);
  const r = reveal(index);

  return (
    <li className={cn("border-b border-border last:border-b-0", r.className)} style={r.style}>
      <Link href={item.href} className={rowLink}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Icon className="size-3 shrink-0" aria-hidden />
            {MODULE_LABELS[item.module]}
            {waiting ? <span className="tabular-nums"> · {waiting}</span> : null}
          </span>
        </span>
        {item.urgent ? (
          <span
            aria-hidden
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              STATUS_DOT_CLASSES[item.tone === "danger" ? "error" : "warning"],
            )}
          />
        ) : null}
        <ArrowRightIcon
          aria-hidden
          className="mt-1 size-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground"
        />
      </Link>
    </li>
  );
}

function AttentionSection({ items, now }: { items: AttentionItem[]; now: Date }) {
  return (
    <section>
      <SectionHeading count={items.length}>Needs you</SectionHeading>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CheckIcon className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">Nothing is waiting on you.</p>
            <p className="text-xs text-muted-foreground">
              No requests, no overdue fees, no failed deliveries.
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className={LIST_HEIGHT}>
          <ul className="flex flex-col pr-3">
            {items.map((item, index) => (
              <AttentionRow key={item.id} item={item} now={now} index={index} />
            ))}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}

// ─── Coming up ──────────────────────────────────────────────────────────────

function dayHeading(dayOffset: number, date: Date, locale: string) {
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(
    date,
  );
}

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
        <ScrollArea className={LIST_HEIGHT}>
          <ol className="flex flex-col gap-4 pr-3">
            {days.map((day, dayIndex) => (
              <li key={day.dayOffset}>
                <h3
                  className={cn(
                    "mb-1 font-sans text-xs font-semibold tracking-wider uppercase",
                    day.dayOffset === 0 ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {dayHeading(day.dayOffset, day.date, locale)}
                  {day.dayOffset > 1 ? (
                    <span className="ml-2 font-normal normal-case tracking-normal">
                      in {day.dayOffset} days
                    </span>
                  ) : null}
                </h3>
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
        </ScrollArea>
      )}
    </section>
  );
}

// ─── Just happened ──────────────────────────────────────────────────────────

function relativeTime(at: Date, now: Date, locale: string) {
  const diffMs = at.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(diffMs / 3_600_000);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(daysUntil(at, now), "day");
}

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
        <ScrollArea className={LIST_HEIGHT}>
          <ul className="flex flex-col pr-3">
            {items.map((item, index) => {
              const Icon = MODULE_ICONS[item.module];
              const r = reveal(startIndex + index);
              return (
                <li
                  key={item.id}
                  className={cn("border-b border-border last:border-b-0", r.className)}
                  style={r.style}
                >
                  <Link href={item.href} className={rowLink}>
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-3" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                    <time
                      dateTime={item.at.toISOString()}
                      className="shrink-0 pt-0.5 text-xs whitespace-nowrap tabular-nums text-muted-foreground"
                    >
                      {relativeTime(item.at, now, locale)}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
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
