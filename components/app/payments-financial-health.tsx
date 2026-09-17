"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, StatDescription, StatGroup, StatLabel, StatValue } from "@/components/ui/stat";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PaymentStats } from "@/server/queries/payments";
import { feeToMajorUnits, PAYMENT_STATUS_COLORS } from "@/lib/payments";
import { useFormatLocale } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

function formatCents(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(feeToMajorUnits(cents) ?? 0);
}

function paymentCount(count: number): string {
  return `${count} payment${count !== 1 ? "s" : ""}`;
}

const DEBT_ROWS = 5;

export function PaymentsFinancialHealth({ stats, currency = "CZK" }: { stats: PaymentStats; currency?: string }) {
  const locale = useFormatLocale();

  // Money, not counts: the stat cards above already give the counts, and one
  // 700 CZK overdue fee matters more than seven 55 CZK pendings.
  const segments = [
    { key: "paid", label: "Paid", ...stats.paid, fill: PAYMENT_STATUS_COLORS.paid.chart },
    { key: "pending", label: "Pending", ...stats.pending, fill: PAYMENT_STATUS_COLORS.pending.chart },
    { key: "overdue", label: "Overdue", ...stats.overdue, fill: PAYMENT_STATUS_COLORS.overdue.chart },
    { key: "refund_due", label: "Refund due", ...stats.refundDue, fill: PAYMENT_STATUS_COLORS.refund_due.chart },
  ].filter((s) => s.totalCents > 0);
  const barTotal = segments.reduce((sum, s) => sum + s.totalCents, 0);

  const collectible = stats.paid.totalCents + stats.pending.totalCents + stats.overdue.totalCents;
  const oldestDays = stats.debtAging[0]?.daysOverdue ?? 0;

  return (
    <div className="mb-8 space-y-4">
      <h2 className="font-sans text-lg font-semibold">Financial health</h2>

      <StatGroup columns={4}>
        <Stat>
          <StatLabel>Collected</StatLabel>
          <StatValue tone="success">{formatCents(stats.paid.totalCents, currency, locale)}</StatValue>
          <StatDescription>{paymentCount(stats.paid.count)}</StatDescription>
        </Stat>
        <Stat>
          <StatLabel>Pending</StatLabel>
          <StatValue tone="info">{formatCents(stats.pending.totalCents, currency, locale)}</StatValue>
          <StatDescription>{paymentCount(stats.pending.count)}</StatDescription>
        </Stat>
        <Stat>
          <StatLabel>Overdue</StatLabel>
          <StatValue tone={stats.overdue.count > 0 ? "danger" : "default"}>
            {formatCents(stats.overdue.totalCents, currency, locale)}
          </StatValue>
          <StatDescription>{paymentCount(stats.overdue.count)}</StatDescription>
        </Stat>
        <Stat>
          <StatLabel>Collection rate</StatLabel>
          <StatValue tone={stats.collectionRate >= 80 ? "success" : stats.collectionRate >= 50 ? "warning" : "danger"}>
            {stats.collectionRate}%
          </StatValue>
          {/* The rate is by amount, so the denominator is an amount too. */}
          <StatDescription>
            {formatCents(stats.paid.totalCents, currency, locale)} of {formatCents(collectible, currency, locale)} collectible
          </StatDescription>
        </Stat>
      </StatGroup>

      {segments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-sans text-sm font-medium text-muted-foreground">
              Where the money is
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div
              className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
              role="img"
              aria-label={segments.map((s) => `${s.label} ${formatCents(s.totalCents, currency, locale)}`).join(", ")}
            >
              {segments.map((s) => (
                <Tooltip key={s.key}>
                  <TooltipTrigger asChild>
                    <div
                      className="h-full min-w-1 transition-[flex-grow] duration-500"
                      style={{ flexGrow: s.totalCents, flexBasis: 0, backgroundColor: s.fill }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {s.label} · {formatCents(s.totalCents, currency, locale)} · {paymentCount(s.count)}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <dl className="flex flex-wrap gap-x-5 gap-y-1">
              {segments.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-sm">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.fill }} />
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd className="font-medium tabular-nums">
                    {formatCents(s.totalCents, currency, locale)}
                    <span className="ml-1 font-normal text-muted-foreground">
                      {Math.round((s.totalCents / barTotal) * 100)}%
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {stats.debtAging.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-baseline justify-between font-sans text-sm font-medium text-muted-foreground">
              <span>Debt aging — longest overdue</span>
              {stats.debtAging.length > DEBT_ROWS ? (
                <span className="text-xs font-normal">top {DEBT_ROWS} of {stats.debtAging.length}</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {stats.debtAging.slice(0, DEBT_ROWS).map((row, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-6 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.memberName}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.periodLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums text-destructive">
                      {formatCents(row.amountCents, row.currency, locale)}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">{row.daysOverdue}d overdue</p>
                  </div>
                  {/* Age relative to the oldest debt on the list, so the top row is always full. */}
                  <div className="col-span-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", row.daysOverdue >= 30 ? "bg-destructive" : "bg-orange-500")}
                      style={{ width: `${Math.max(4, (row.daysOverdue / Math.max(oldestDays, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
