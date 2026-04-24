"use client";

import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { ImportResult } from "./types";

export function StepDone({ result }: { result: ImportResult }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="rounded-full bg-green-100 p-4 dark:bg-green-900/30">
          <CheckCircle2Icon className="size-8 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Import complete</h2>
          <p className="text-sm text-muted-foreground">
            Your CSV has been processed.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Created",
            value: result.created,
            color: "text-green-600 dark:text-green-400",
          },
          {
            label: "Updated",
            value: result.updated,
            color: "text-blue-600 dark:text-blue-400",
          },
          {
            label: "Skipped",
            value: result.skipped,
            color: "text-amber-600 dark:text-amber-400",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1 rounded-xl border bg-muted/30 px-4 py-3"
          >
            <span className={`text-2xl font-bold tabular-nums ${color}`}>
              {value}
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {result.errors.length > 0 && (
        <div className="flex flex-col gap-2">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>
              {result.errors.length} row
              {result.errors.length !== 1 ? "s" : ""} had errors
            </AlertTitle>
            <AlertDescription>
              These rows were skipped. Review the details below.
            </AlertDescription>
          </Alert>
          <ScrollArea className="max-h-40 rounded-lg border">
            <div className="divide-y text-xs">
              {result.errors.map(({ row, message }) => (
                <div
                  key={row}
                  className="flex items-start gap-3 px-3 py-2"
                >
                  <Badge variant="outline" className="shrink-0 font-mono">
                    Row {row}
                  </Badge>
                  <span className="text-muted-foreground">{message}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
