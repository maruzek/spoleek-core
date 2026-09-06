import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The one shape every standing note on the report pages takes.
 *
 * Deliberately quieter than `Alert`: no serif heading, no destructive red.
 * These notices describe a state somebody has to deal with eventually, not an
 * error that just happened, and painting them like errors was training the
 * board to skim past the whole top of the page. Colour is spent on a single
 * accent rail, so the tone is readable without the text shouting.
 */
export function ReportNotice({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Rendered on the right, opposite the title. */
  action?: React.ReactNode;
  tone?: "neutral" | "attention";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-l-3 p-4",
        tone === "attention"
          ? "border-l-orange-500 bg-orange-500/[0.04] dark:border-l-orange-400"
          : "border-l-border bg-muted/30",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon ? (
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
                tone === "attention"
                  ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  : "bg-background text-muted-foreground",
              )}
            >
              {icon}
            </span>
          ) : null}
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-sm">{title}</p>
            {description ? (
              <p className="max-w-prose text-muted-foreground text-sm">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}
