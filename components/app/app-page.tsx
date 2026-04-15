import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <div className="flex flex-1 flex-col gap-6">
      <Card>
        <CardHeader className="gap-4 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2">
            {eyebrow ? (
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <CardTitle className="text-3xl md:text-4xl">{title}</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6 md:text-base">
              {description}
            </CardDescription>
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </CardHeader>
      </Card>
      <Card className="bg-transparent py-0 ring-0 shadow-none">
        <CardContent className="px-0">{children}</CardContent>
      </Card>
    </div>
  );
}
