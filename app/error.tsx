"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8f7f3_0%,#f4efe4_100%)] p-4 sm:p-6 md:p-8">
      <div className="flex w-full flex-col items-center max-w-2xl overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] border border-slate-950/10 bg-white p-8 sm:p-12 text-center shadow-[0_24px_80px_-32px_rgba(15,23,42,0.25)]">
        <div className="mb-6 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-red-50 ring-1 ring-red-100/50 shadow-sm">
          <AlertTriangle className="h-7 w-7 text-red-500" strokeWidth={2} />
        </div>

        <p className="mb-3 text-xs font-bold tracking-[0.28em] uppercase text-slate-500">
          Unexpected Error
        </p>

        <h1 className="mb-6 max-w-lg text-balance text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Something interrupted the flow.
        </h1>

        <div className="relative w-full rounded-2xl bg-slate-50/80 p-5 shadow-inner border border-slate-200/60">
          <div className="max-h-[280px] w-full overflow-y-auto overflow-x-hidden text-left [scrollbar-width:thin]">
            <p className="text-sm leading-relaxed text-slate-600 break-words font-mono">
              {error.message || "An unexpected problem occurred while loading this page."}
            </p>
            {error.digest && (
              <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-400 font-mono">
                Digest ID: <span className="font-semibold text-slate-500">{error.digest}</span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Button 
            onClick={() => reset()} 
            size="lg" 
            className="w-full rounded-xl sm:w-auto sm:px-8 text-sm transition-all shadow-sm"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button 
            variant="outline"
            onClick={() => window.location.href = '/'} 
            size="lg" 
            className="w-full rounded-xl sm:w-auto sm:px-8 text-sm bg-transparent"
          >
            Go to homepage
          </Button>
        </div>
      </div>
    </div>
  );
}
