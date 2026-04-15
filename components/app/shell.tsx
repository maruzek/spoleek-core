import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type AppShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function AppShell({
  children,
  eyebrow,
  title,
  description,
  actions,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(170,230,201,0.35),_transparent_32%),linear-gradient(180deg,#f8f7f3_0%,#f4efe4_100%)] text-slate-950">
      <header className="border-b border-slate-950/10 bg-white/75 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-[0.24em] uppercase">
            Spoleek
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost">
              <Link href="/portal">Portal</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/members">Members</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="rounded-4xl border border-slate-950/10 bg-white/90 p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
          {eyebrow ? (
            <p className="text-xs font-semibold tracking-[0.28em] uppercase text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                {title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                {description}
              </p>
            </div>
            {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}
