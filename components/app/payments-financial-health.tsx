"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, StatDescription, StatGroup, StatLabel, StatValue } from "@/components/ui/stat";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PaymentStats } from "@/server/queries/payments";
import { feeToMajorUnits, PAYMENT_STATUS_COLORS } from "@/lib/payments";
import { useFormatLocale } from "@/components/locale-provider";

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

    </div>
  );
}
