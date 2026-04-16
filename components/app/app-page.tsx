import type { ReactNode } from "react";

import { InfoIcon } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

type AppPageProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  tooltip?: ReactNode;
};

export function AppPage({
  children,
  eyebrow,
  title,
  description,
  actions,
  tooltip,
}: AppPageProps) {
  return (
    <div className="flex flex-1 flex-col pb-8">
      <header className="flex flex-col gap-4 pb-4 md:pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1.5">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
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
          {actions ? (
            <div className="flex items-center gap-3">{actions}</div>
          ) : null}
        </div>
      </header>

      <Separator className="mb-6" />

      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
