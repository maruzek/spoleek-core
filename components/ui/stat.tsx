import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * The one way to show a number that matters.
 *
 * Adapted from Dice UI's Stat. Everything is sans-serif — the heading serif is
 * for page titles, not numbers. `StatGroup` decides whether a set of stats
 * reads as separate cards or as one strip divided by hairlines; the stat
 * itself never carries that decision.
 */

const statGroupVariants = cva("grid", {
  variants: {
    variant: {
      // Free-standing cards: each stat has its own ring, like `Card`.
      cards: "gap-4",
      // One surface, hairlines between: the stat drops its own chrome.
      strip: "gap-px overflow-hidden rounded-xl border bg-border",
      // Strip without the outer frame, for embedding at the bottom of a card.
      inset: "gap-px bg-border",
    },
    columns: {
      2: "grid-cols-2",
      3: "grid-cols-2 sm:grid-cols-3",
      4: "grid-cols-2 lg:grid-cols-4",
      5: "grid-cols-2 lg:grid-cols-5",
    },
  },
  defaultVariants: {
    variant: "cards",
    columns: 4,
  },
});

function StatGroup({
  className,
  variant = "cards",
  columns = 4,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof statGroupVariants>) {
  return (
    <div
      data-slot="stat-group"
      data-variant={variant}
      className={cn(statGroupVariants({ variant, columns }), className)}
      {...props}
    />
  );
}

function Stat({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="stat"
      className={cn(
        "grid grid-cols-[1fr_auto] content-start gap-x-4 gap-y-1 rounded-xl bg-card p-4 text-left text-card-foreground ring-1 ring-foreground/10",
        // Inside a strip the group owns the frame. The inset tint is opaque:
        // the group's background is the hairline colour, and a translucent
        // stat over it read as a much darker grey than intended.
        "in-data-[variant=strip]:rounded-none in-data-[variant=strip]:ring-0 in-data-[variant=inset]:rounded-none in-data-[variant=inset]:ring-0 in-data-[variant=inset]:bg-[color-mix(in_oklab,var(--muted)_45%,var(--card))]",
        // Clickable stats (rendered as a button via `asChild`) behave like tiles.
        "transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&:is(button,a)]:cursor-pointer [&:is(button,a)]:hover:bg-muted/50",
        "**:data-[slot=stat-label]:col-start-1 **:data-[slot=stat-value]:col-start-1",
        "**:data-[slot=stat-indicator]:col-start-2 **:data-[slot=stat-indicator]:row-span-2 **:data-[slot=stat-indicator]:row-start-1 **:data-[slot=stat-indicator]:self-start",
        "**:data-[slot=stat-description]:col-span-2 **:data-[slot=stat-separator]:col-span-2 **:data-[slot=stat-trend]:col-span-2 **:data-[slot=stat-meter]:col-span-2",
        className,
      )}
      {...props}
    />
  );
}

function StatLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stat-label"
      className={cn("text-sm font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

const statValueVariants = cva(
  "flex items-baseline gap-1.5 text-3xl font-semibold leading-none tabular-nums tracking-tight",
  {
    variants: {
      tone: {
        default: "text-foreground",
        success: "text-emerald-700 dark:text-emerald-400",
        info: "text-blue-600 dark:text-blue-400",
        warning: "text-orange-600 dark:text-orange-400",
        danger: "text-destructive",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

function StatValue({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof statValueVariants>) {
  return (
    <div
      data-slot="stat-value"
      data-tone={tone}
      className={cn(statValueVariants({ tone }), className)}
      {...props}
    />
  );
}

/** A denominator or unit set beside the numeral: `<StatValue>3 <StatValueOf>/ 12</StatValueOf></StatValue>`. */
function StatValueOf({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="stat-value-of"
      className={cn("text-sm font-normal tabular-nums tracking-normal text-muted-foreground", className)}
      {...props}
    />
  );
}

const statIndicatorVariants = cva(
  "flex shrink-0 items-center justify-center [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "text-muted-foreground [&_svg:not([class*='size-'])]:size-5",
        icon: "size-8 rounded-md border [&_svg:not([class*='size-'])]:size-3.5",
        badge:
          "h-6 min-w-6 rounded-sm border px-1.5 text-xs font-medium [&_svg:not([class*='size-'])]:size-3",
        // A slot for a ghost icon button; the button brings its own hover.
        action: "-mt-1.5 -mr-1.5",
      },
      color: {
        default: "bg-muted text-muted-foreground",
        success: "border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400",
        info: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
        warning: "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400",
        error: "border-destructive/20 bg-destructive/10 text-destructive",
      },
    },
    compoundVariants: [
      { variant: "default", className: "bg-transparent" },
      { variant: "action", className: "bg-transparent" },
    ],
    defaultVariants: {
      variant: "default",
      color: "default",
    },
  },
);

function StatIndicator({
  className,
  variant = "default",
  color = "default",
  ...props
}: Omit<React.ComponentProps<"div">, "color"> & VariantProps<typeof statIndicatorVariants>) {
  return (
    <div
      data-slot="stat-indicator"
      data-variant={variant}
      data-color={color}
      className={cn(statIndicatorVariants({ variant, color }), className)}
      {...props}
    />
  );
}

function StatTrend({
  className,
  trend,
  ...props
}: React.ComponentProps<"div"> & { trend?: "up" | "down" | "neutral" }) {
  return (
    <div
      data-slot="stat-trend"
      data-trend={trend}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
        {
          "text-emerald-700 dark:text-emerald-400": trend === "up",
          "text-destructive": trend === "down",
          "text-muted-foreground": trend === "neutral" || !trend,
        },
        className,
      )}
      {...props}
    />
  );
}

/** A thin fill bar under the numeral, for a value that has a ceiling. */
function StatMeter({
  className,
  ratio,
  ...props
}: React.ComponentProps<"div"> & { ratio: number }) {
  const clamped = Math.max(0, Math.min(1, ratio));

  return (
    <div
      data-slot="stat-meter"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn("mt-1 h-1 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          clamped >= 1 ? "bg-orange-500" : "bg-primary",
        )}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}

function StatSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return <Separator data-slot="stat-separator" className={cn("my-2", className)} {...props} />;
}

function StatDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stat-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Stat,
  StatDescription,
  StatGroup,
  StatIndicator,
  StatLabel,
  StatMeter,
  StatSeparator,
  StatTrend,
  StatValue,
  StatValueOf,
};
