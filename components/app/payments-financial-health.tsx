"use client";

import * as RechartsPrimitive from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { PaymentStats } from "@/server/queries/payments";

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "amber" | "blue";
}) {
  const accentClass = {
    green: "text-emerald-700",
    red: "text-red-600",
    amber: "text-amber-600",
    blue: "text-blue-600",
  }[accent ?? "green"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold ${accentClass}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const chartConfig = {
  paid: { label: "Paid", color: "#176b4d" },
  pending: { label: "Pending", color: "#3b82f6" },
  overdue: { label: "Overdue", color: "#ef4444" },
} satisfies ChartConfig;

export function PaymentsFinancialHealth({ stats, currency = "CZK" }: { stats: PaymentStats; currency?: string }) {
  const donutData = [
    { name: "paid", value: stats.paid.count, fill: chartConfig.paid.color },
    { name: "pending", value: stats.pending.count, fill: chartConfig.pending.color },
    { name: "overdue", value: stats.overdue.count, fill: chartConfig.overdue.color },
  ].filter((d) => d.value > 0);

  const totalPayments = stats.paid.count + stats.pending.count + stats.overdue.count;

  return (
    <div className="mb-8 space-y-4">
      <h2 className="text-lg font-semibold">Financial health</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Collected"
          value={formatCents(stats.paid.totalCents, currency)}
          sub={`${stats.paid.count} payment${stats.paid.count !== 1 ? "s" : ""}`}
          accent="green"
        />
        <StatCard
          label="Pending"
          value={formatCents(stats.pending.totalCents, currency)}
          sub={`${stats.pending.count} payment${stats.pending.count !== 1 ? "s" : ""}`}
          accent="blue"
        />
        <StatCard
          label="Overdue"
          value={formatCents(stats.overdue.totalCents, currency)}
          sub={`${stats.overdue.count} payment${stats.overdue.count !== 1 ? "s" : ""}`}
          accent="red"
        />
        <StatCard
          label="Collection rate"
          value={`${stats.collectionRate}%`}
          sub={`of ${totalPayments} total`}
          accent={stats.collectionRate >= 80 ? "green" : stats.collectionRate >= 50 ? "amber" : "red"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {donutData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Payment status distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="mx-auto max-h-[220px]">
                <RechartsPrimitive.PieChart>
                  <RechartsPrimitive.Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
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
              <div className="mt-3 flex justify-center gap-4">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ backgroundColor: d.fill }} />
                    {chartConfig[d.name as keyof typeof chartConfig]?.label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {stats.debtAging.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
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
                        {formatCents(row.amountCents, row.currency)}
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
