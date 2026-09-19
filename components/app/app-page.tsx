import type { ReactNode } from "react";

import { InfoIcon } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The frame every signed-in page sits in: eyebrow, serif title, one line of
 * description, actions on the right, a hairline, then the content.
 *
 * `width` is the only layout decision a page makes:
 * - `full` — tables, dashboards and anything that earns the whole canvas.
 * - `content` — forms, settings and reading pages. Capped and centred so a
 *   narrow column does not sit in the corner of a wide screen.
 *
 * `aside` renders a right-hand column (help, status, related) next to the
 * content on large screens and below it on small ones. Use it to give a
 * `content` page something to do with the remaining width instead of
 * widening the form.
 */
type AppPageProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  tooltip?: ReactNode;
  width?: "full" | "content";
  aside?: ReactNode;
  children: ReactNode;
};

export const PAGE_CONTENT_WIDTH = "mx-auto w-full max-w-4xl";

export function AppPage({
  children,
  eyebrow,
  title,
  description,
  actions,
  tooltip,
  width = "full",
  aside,
}: AppPageProps) {
  return (
    <div className={cn("flex flex-1 flex-col pb-8", width === "content" && PAGE_CONTENT_WIDTH)}>
      <header className="flex flex-col gap-4 pb-4 md:pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1.5">
            {eyebrow ? <PageEyebrow>{eyebrow}</PageEyebrow> : null}
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {title}
              </h1>
              {tooltip ? (
                <Tooltip>
                  <TooltipTrigger className="focus:outline-none" asChild>
                    <InfoIcon className="size-5 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            {description ? (
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
        </div>
      </header>

      <Separator className="mb-6" />

      {aside ? (
        <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <main className="flex min-w-0 flex-col">{children}</main>
          <aside className="flex flex-col gap-4">{aside}</aside>
        </div>
      ) : (
        <main className="flex flex-1 flex-col">{children}</main>
      )}
    </div>
  );
}

/** The small caps line above a title: "MEMBER PORTAL", "KRAJE". */
export function PageEyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-wider text-muted-foreground/80", className)}>
      {children}
    </p>
  );
}
