"use client";

import { cn } from "@/lib/utils";

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
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border",
        // A priced event adds a fifth tile; keep one row rather than an orphan.
        stats.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4",
      )}
    >
      {stats.map((stat) => {
        const ratio = stat.of ? Math.min(1, stat.value / stat.of) : null;
        const Tag = stat.onClick ? "button" : "div";
        return (
          <Tag
            key={stat.key}
            type={stat.onClick ? "button" : undefined}
            onClick={stat.onClick}
            className={cn(
              "group flex flex-col gap-1 bg-card px-4 py-3.5 text-left transition-colors",
              stat.onClick && "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            )}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</span>
            <span className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-heading text-3xl leading-none tabular-nums tracking-tight",
                  stat.tone === "warning" && stat.value > 0 ? "text-amber-700 dark:text-amber-500" : "text-foreground",
                )}
              >
                {stat.value}
              </span>
              {stat.of ? <span className="text-sm tabular-nums text-muted-foreground">/ {stat.of}</span> : null}
            </span>
            {ratio != null ? (
              <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("block h-full rounded-full transition-[width]", ratio >= 1 ? "bg-amber-500" : "bg-primary")}
                  style={{ width: `${ratio * 100}%` }}
                />
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">{stat.hint}</span>
          </Tag>
        );
      })}
    </div>
  );
}
