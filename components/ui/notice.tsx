import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The one shape every standing, page-level message takes: a rail of colour
 * on the left, a sans title, a muted line, and an optional action opposite.
 *
 * `Notice` describes a state the reader will have to deal with — an event is
 * cancelled, a member owes money, a report is missing people. It is not for
 * feedback on something that just happened: a failed save is an inline
 * `Alert` in the form, a successful save is a toast.
 *
 * Colour is spent on the rail and icon only, so a page with two notices does
 * not shout. `danger` is for a blocked or broken state, `attention` for one
 * that somebody has to resolve eventually, `success` for a confirmed good
 * state, `info` for a neutral fact worth a box, `neutral` for context.
 */
const noticeVariants = cva(
  "flex flex-col gap-3 rounded-xl border border-l-3 p-4 text-left",
  {
    variants: {
      tone: {
        neutral: "border-l-border bg-muted/30",
        info: "border-l-blue-500 bg-blue-500/[0.04] dark:border-l-blue-400",
        success: "border-l-emerald-600 bg-emerald-500/[0.04] dark:border-l-emerald-400",
        attention: "border-l-orange-500 bg-orange-500/[0.04] dark:border-l-orange-400",
        danger: "border-l-destructive bg-destructive/[0.04]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

const noticeIconVariants = cva(
  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
  {
    variants: {
      tone: {
        neutral: "bg-background text-muted-foreground",
        info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        attention: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
        danger: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type NoticeTone = NonNullable<VariantProps<typeof noticeVariants>["tone"]>;

export function Notice({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof noticeVariants> & {
    icon?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    /** Rendered on the right, opposite the title. */
    action?: React.ReactNode;
  }) {
  return (
    <div
      role="status"
      data-slot="notice"
      data-tone={tone}
      className={cn(noticeVariants({ tone }), className)}
      {...props}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? <span className={noticeIconVariants({ tone })}>{icon}</span> : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">{title}</p>
            {description ? (
              <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}
