"use client";

import {
  Stat,
  StatDescription,
  StatGroup,
  StatLabel,
  StatMeter,
  StatValue,
  StatValueOf,
} from "@/components/ui/stat";

export type EventStat = {
  key: string;
  label: string;
  value: number;
  /** Denominator, rendered as `value / of` with a fill bar. */
  of?: number | null;
  hint: string;
  tone?: "default" | "warning";
  onClick?: () => void;
};

/**
 * Numbers first, words second. Each tile is a shortcut to the tab that
 * explains the number, so the strip is navigation as much as summary.
 */
export function EventAdminStats({ stats }: { stats: EventStat[] }) {
  return (
    // A priced event adds a fifth tile; keep one row rather than an orphan.
    <StatGroup variant="strip" columns={stats.length === 5 ? 5 : 4}>
      {stats.map((stat) => {
        const ratio = stat.of ? stat.value / stat.of : null;
        const body = (
          <>
            <StatLabel>{stat.label}</StatLabel>
            <StatValue tone={stat.tone === "warning" && stat.value > 0 ? "warning" : "default"}>
              {stat.value}
              {stat.of ? <StatValueOf>/ {stat.of}</StatValueOf> : null}
            </StatValue>
            {ratio != null ? <StatMeter ratio={ratio} /> : null}
            <StatDescription>{stat.hint}</StatDescription>
          </>
        );

        return stat.onClick ? (
          <Stat key={stat.key} asChild>
            <button type="button" onClick={stat.onClick}>
              {body}
            </button>
          </Stat>
        ) : (
          <Stat key={stat.key}>{body}</Stat>
        );
      })}
    </StatGroup>
  );
}
