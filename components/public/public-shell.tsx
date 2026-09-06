import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type PublicShellProps = {
  /** Organization (or product) name shown in the header. */
  brand?: string | null;
  /** Optional link rendered on the left of the header, e.g. a back link. */
  leading?: ReactNode;
  /** Constrains the content column. Auth pages want a narrow one. */
  width?: "narrow" | "wide";
  children: ReactNode;
};

/**
 * Shared chrome for every signed-out page (login, join, activation, legal).
 * Owns the beige/green canvas so the gradient lives in exactly one place and
 * responds to the theme like the rest of the app.
 */
export function PublicShell({
  brand,
  leading,
  width = "wide",
  children,
}: PublicShellProps) {
  return (
    <div className="public-surface flex min-h-screen flex-col">
      <a
        href="#public-main"
        className="sr-only rounded-md px-4 py-2 focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to content
      </a>

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-5">
        <div className="flex min-w-0 items-center gap-2">{leading}</div>
        <div className="flex items-center gap-3">
          {brand ? (
            <Link
              href="/"
              className="truncate text-xs tracking-[0.28em] text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              {brand}
            </Link>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      <main
        id="public-main"
        className={cn(
          "mx-auto flex w-full flex-1 flex-col justify-center px-6 py-8",
          width === "narrow" ? "max-w-md" : "max-w-5xl",
        )}
      >
        {children}
      </main>

      <footer className="mx-auto flex w-full max-w-5xl items-center justify-center gap-5 px-6 py-6 text-xs text-muted-foreground">
        <Link href="/legal/terms" className="transition-colors hover:text-foreground">
          Terms
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
