"use client";

import { Loader2Icon } from "lucide-react";

export function StepImporting({ rowCount }: { rowCount: number }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-4">
      <Loader2Icon className="size-10 animate-spin text-primary" />
      <div className="text-center">
        <p className="text-base font-semibold">Importing members…</p>
        <p className="text-sm text-muted-foreground">
          Processing {rowCount} row{rowCount !== 1 ? "s" : ""}. This may take a
          moment.
        </p>
      </div>
    </div>
  );
}
