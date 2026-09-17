"use client";

import * as RechartsPrimitive from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, StatDescription, StatGroup, StatLabel, StatValue } from "@/components/ui/stat";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
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

const chartConfig = {
  paid: { label: "Paid", color: PAYMENT_STATUS_COLORS.paid.chart },
  pending: { label: "Pending", color: PAYMENT_STATUS_COLORS.pending.chart },
  overdue: { label: "Overdue", color: PAYMENT_STATUS_COLORS.overdue.chart },
} satisfies ChartConfig;

export function PaymentsFinancialHealth({ stats, currency = "CZK" }: { stats: PaymentStats; currency?: string }) {
  const locale = useFormatLocale();
  const donutData = [
    { name: "paid", value: stats.paid.count, fill: chartConfig.paid.color },
    { name: "pending", value: stats.pending.count, fill: chartConfig.pending.color },
    { name: "overdue", value: stats.overdue.count, fill: chartConfig.overdue.color },
  ].filter((d) => d.value > 0);

  const totalPayments = stats.paid.count + stats.pending.count + stats.overdue.count;

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
          <StatDescription>of {totalPayments} total</StatDescription>
        </Stat>
      </StatGroup>

      {/* `items-start` so a short debt list does not stretch to the chart's height. */}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {donutData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-sans text-sm font-medium text-muted-foreground">
                Payment status distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-6">
              <ChartContainer config={chartConfig} className="aspect-square h-[160px] shrink-0">
                <RechartsPrimitive.PieChart>
                  <RechartsPrimitive.Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={76}
                    paddingAngle={2}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => [
                          `${value} payment${Number(value) !== 1 ? "s" : ""}`,
                          chartConfig[name as keyof typeof chartConfig]?.label ?? name,
                        ]}
                      />
                    }
                  />
                </RechartsPrimitive.PieChart>
              </ChartContainer>
              <dl className="flex flex-col gap-2">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: d.fill }} />
                    <dt className="text-muted-foreground">{chartConfig[d.name as keyof typeof chartConfig]?.label}</dt>
                    <dd className="font-medium tabular-nums">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}

        {stats.debtAging.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-sans text-sm font-medium text-muted-foreground">
                Debt aging — longest overdue
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {stats.debtAging.slice(0, 8).map((row, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.memberName}</p>
                      <p className="text-xs text-muted-foreground">{row.periodLabel}</p>
                    </div>
                    <div className="ml-4 shrink-0 text-right">
                      <p className="font-medium text-red-600">
                        {formatCents(row.amountCents, row.currency, locale)}
                      </p>
                      <p className="text-xs text-muted-foreground">{row.daysOverdue}d overdue</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
