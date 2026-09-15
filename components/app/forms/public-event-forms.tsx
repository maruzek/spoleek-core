import Link from "next/link";
import { ArrowRightIcon, CheckIcon, ClipboardListIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import type { EventFormItem } from "@/server/queries/forms";

/**
 * Open forms on the public and personal-link event pages. Server component;
 * the href prefix decides which filler the link lands on.
 */
export function PublicEventForms({
  items,
  hrefFor,
  t,
}: {
  items: EventFormItem[];
  hrefFor: (formId: string) => string;
  t: Dictionary["forms"];
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold tracking-tight">{t.public.openForms}</h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const submitted = item.submittedAt != null;
          return (
            <li
              key={item.form.id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-xs",
                item.pending && "border-amber-500/40",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                  submitted ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {submitted ? <CheckIcon className="size-4" /> : <ClipboardListIcon className="size-4" />}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {item.form.title}
                  {submitted ? (
                    <Badge variant="secondary">{t.submittedBadge}</Badge>
                  ) : item.form.required ? (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-500">
                      {t.requiredBadge}
                    </Badge>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">{t.timing[item.form.timing]}</span>
              </div>
              <Button asChild size="sm" variant={submitted ? "outline" : "default"}>
                <Link href={hrefFor(item.form.id)}>
                  {submitted ? t.edit : t.fillIn}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
