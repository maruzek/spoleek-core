import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The header of a page about one thing — an event, a group, a member, a form.
 *
 * Reads top to bottom: back link, then a leading visual (date leaf, avatar)
 * beside a stack of status pills, the serif title, and one line of icon
 * facts. Actions sit on the right. Every entity page uses this so the eye
 * lands in the same place regardless of what the thing is.
 */
export function DetailHeader({
  backHref,
  backLabel,
  leading,
  badges,
  title,
  titleClassName,
  meta,
  actions,
  className,
}: {
  backHref?: string;
  backLabel?: string;
  /** Date leaf, avatar or icon tile shown before the text stack. */
  leading?: ReactNode;
  /** Status pills and badges above the title. */
  badges?: ReactNode;
  title: ReactNode;
  titleClassName?: string;
  /** `DetailMeta` — the icon facts under the title. */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {backHref ? (
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <Link href={backHref}>
              <ArrowLeftIcon aria-hidden />
              {backLabel}
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {leading}
          <div className="flex min-w-0 flex-col gap-1.5">
            {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
            <h1
              className={cn(
                "font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl",
                titleClassName,
              )}
            >
              {title}
            </h1>
            {meta}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

/** The line of icon facts under a detail title. */
export function DetailMeta({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <dl className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground", className)}>
      {children}
    </dl>
  );
}

export function DetailMetaItem({
  icon,
  className,
  children,
}: {
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0", className)}>
      {icon}
      <dd className="truncate">{children}</dd>
    </div>
  );
}
