"use client";

import { useMemo, useState } from "react";
import * as RechartsPrimitive from "recharts";

import type { ReportHistoryPoint } from "@/server/queries/membership-reports";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const chartConfig = {
  members: { label: "Members confirmed", color: "#176b4d" },
} satisfies ChartConfig;

const ALL_GROUPS = "all";

/**
 * Confirmed members per reported year, for the whole organization or one group.
 *
 * Lives behind an icon on the members stat rather than on the page: the board
 * needs the trend once a year, when reviewing, and the table below it is what
 * the page is for.
 */
export function ReportHistoryChart({
  history,
  currentPeriodLabel,
}: {
  history: ReportHistoryPoint[];
  /** Marked on the axis so the year being reviewed is findable. */
  currentPeriodLabel: string;
}) {
  const [groupId, setGroupId] = useState(ALL_GROUPS);

  // Every group that has ever reported, not only the ones in this year — a
  // retired region's history is the most interesting part of a trend.
  const groupOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const point of history) {
      for (const group of point.byGroup) {
        if (group.groupId) byId.set(group.groupId, group.groupName);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [history]);

  const data = useMemo(
    () =>
      history.map((point) => {
        if (groupId === ALL_GROUPS) {
          return { periodLabel: point.periodLabel, members: point.totalMembers };
        }

        const group = point.byGroup.find((row) => row.groupId === groupId);

        return {
          periodLabel: point.periodLabel,
          // Null, not zero: a group that did not report that year breaks the
          // line rather than drawing a collapse to nobody.
          members: group ? group.memberCount : null,
        };
      }),
    [history, groupId],
  );

  return (
    <div className="flex flex-col gap-4">
      {groupOptions.length > 1 ? (
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger id="report-history-group" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_GROUPS}>All groups</SelectItem>
            {groupOptions.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <ChartContainer config={chartConfig} className="max-h-[260px] w-full">
        <RechartsPrimitive.LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
        >
          <RechartsPrimitive.CartesianGrid vertical={false} strokeDasharray="3 3" />
          <RechartsPrimitive.XAxis
            dataKey="periodLabel"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 12 }}
          />
          <RechartsPrimitive.YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={36}
            tick={{ fontSize: 12 }}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => [
                  `${value} member${Number(value) === 1 ? "" : "s"}`,
                  chartConfig.members.label,
                ]}
              />
            }
          />
          <RechartsPrimitive.ReferenceLine
            x={currentPeriodLabel}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
          />
          <RechartsPrimitive.Line
            dataKey="members"
            type="monotone"
            stroke={chartConfig.members.color}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </RechartsPrimitive.LineChart>
      </ChartContainer>

      <p className="text-muted-foreground text-sm">
        What each year actually reported, taken from the rosters as they were
        signed off. A gap in the line is a year that group did not report.
      </p>
    </div>
  );
}
