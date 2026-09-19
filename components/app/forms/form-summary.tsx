"use client";

import { BarChart3Icon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FormQuestion } from "@/server/db/schema";
import type { QuestionAggregate } from "@/server/queries/forms";

/**
 * Option counts per select / multi-select / boolean question. Free-text
 * questions are not summarised (read the table) and special-category ones
 * are excluded before the numbers leave the database.
 */
export function FormSummary({
  questions,
  aggregates,
  submissionCount,
}: {
  questions: FormQuestion[];
  aggregates: QuestionAggregate[];
  submissionCount: number;
}) {
  const byId = new Map(aggregates.map((a) => [a.questionId, a]));
  const eligible = questions.filter(
    (q) =>
      q.kind === "input" &&
      q.sensitivity === "normal" &&
      (q.type === "select" || q.type === "multi_select" || q.type === "boolean"),
  );

  if (eligible.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <BarChart3Icon className="size-5 text-muted-foreground" aria-hidden />
        <p className="font-medium text-lg">Nothing to chart</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Summaries are built for choice and yes / no questions. Free text and sensitive answers are read in the
          Submissions tab.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {eligible.map((q) => {
        const agg = byId.get(q.id);
        const counts = new Map((agg?.counts ?? []).map((c) => [c.value, c.count]));
        const labels =
          q.type === "boolean" ? ["true", "false"] : q.options.length > 0 ? q.options : [...counts.keys()];
        const answered = agg?.answered ?? 0;
        const max = Math.max(1, ...labels.map((l) => counts.get(l) ?? 0));
        return (
          <section key={q.id} className="flex flex-col gap-3 rounded-xl border p-4">
            <header className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold">{q.label}</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {answered} / {submissionCount} answered
              </span>
            </header>
            <ul className="flex flex-col gap-2">
              {labels.map((label) => {
                const count = counts.get(label) ?? 0;
                const share = answered > 0 ? count / answered : 0;
                return (
                  <li key={label} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{q.type === "boolean" ? (label === "true" ? "Yes" : "No") : label}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {count}
                        {answered > 0 ? <span className="ml-1 text-xs">({Math.round(share * 100)}%)</span> : null}
                      </span>
                    </div>
                    <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn("block h-full rounded-full bg-primary transition-[width]", count === 0 && "bg-transparent")}
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
