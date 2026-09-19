import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A titled block inside a page: sans heading with an optional muted count,
 * a hint or action on the right, then the content.
 *
 * Section headings are sans on purpose — the serif belongs to the page title
 * alone, so the eye finds one anchor per page and then reads the sections
 * as structure, not as competing titles.
 */
export function PageSection({
  title,
  count,
  hint,
  description,
  action,
  className,
  children,
}: {
  title: ReactNode;
  /** A muted number after the title: "To do 4". Hidden when 0. */
  count?: number;
  /** Short muted text opposite the title: "next 30 days". */
  hint?: ReactNode;
  description?: ReactNode;
  /** A button or link opposite the title. Wins over `hint` when both are set. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col", className)}>
      <PageSectionHeader
        title={title}
        count={count}
        hint={hint}
        description={description}
        action={action}
      />
      {children}
    </section>
  );
}

export function PageSectionHeader({
  title,
  count,
  hint,
  description,
  action,
  className,
}: {
  title: ReactNode;
  count?: number;
  hint?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-col gap-1", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-2 text-base font-semibold text-foreground">
          {title}
          {count != null && count > 0 ? (
            <span className="text-sm font-normal tabular-nums text-muted-foreground">{count}</span>
          ) : null}
        </h2>
        {action ? (
          <div className="flex shrink-0 items-center gap-2">{action}</div>
        ) : hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
