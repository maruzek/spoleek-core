import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";

type AppPageProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AppPage({
  children,
  eyebrow,
  title,
  description,
  actions,
}: AppPageProps) {
  return (
    <div className="flex flex-1 flex-col pb-8">
      <header className="flex flex-col gap-6 py-6 md:py-8 lg:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              {title}
            </h1>
            <p className="mt-1 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              {description}
            </p>
          </div>
          {actions ? (
            <div className="mt-4 flex items-center gap-3 md:mt-0">
              {actions}
            </div>
          ) : null}
        </div>
      </header>

      <Separator className="mb-8" />

      <main className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
