import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The detail page shows far more facts than the old edit sheet did, so every
 * tab reads from one dense definition list instead of a card per fact. Keeps
 * the label column aligned across sections, which is what makes a long page
 * scannable.
 */
export function DefinitionList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cn("divide-y", className)}>{children}</dl>;
}

export function DefinitionRow({
  label,
  value,
  description,
  action,
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start">
      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{value}</div>
          {description ? (
            <div className="pt-0.5 text-sm text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </dd>
    </div>
  );
}

/** Section heading used inside tabs, in place of a Card per fact group. */
export function DetailSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
