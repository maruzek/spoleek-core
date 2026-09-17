"use client";

import Link from "next/link";
import { ArrowRightIcon, CalendarIcon, CheckIcon, ClipboardListIcon, HourglassIcon } from "lucide-react";

import { useDictionary, useFormatters } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ViewerFormItem } from "@/server/queries/forms";

/** One form as a member sees it in a list: where it belongs, whether it is owed, when it closes. */
export function PortalFormCard({ item, hideEvent = false }: { item: ViewerFormItem; hideEvent?: boolean }) {
  const t = useDictionary().forms;
  const { formatDateTime } = useFormatters();
  const { form, event } = item;
  const submitted = item.submittedAt != null;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 shadow-xs",
        item.pending && "border-amber-500/40",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg border",
          submitted ? "bg-primary/10 text-primary" : item.pending ? "bg-amber-500/10 text-amber-700 dark:text-amber-500" : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {submitted ? <CheckIcon className="size-5" /> : item.pending ? <HourglassIcon className="size-5" /> : <ClipboardListIcon className="size-5" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/portal/forms/${form.id}`} className="font-medium text-foreground hover:underline">
            {form.title}
          </Link>
          {submitted ? (
            <Badge variant="secondary">{t.submittedBadge}</Badge>
          ) : form.required ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-500">
              {t.requiredBadge}
            </Badge>
          ) : (
            <Badge variant="outline">{t.optionalBadge}</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {event && !hideEvent ? (
            <Link href={`/portal/events/${event.slug}`} className="flex items-center gap-1 hover:underline">
              <CalendarIcon className="size-3" aria-hidden />
              {t.forEvent(event.title)}
            </Link>
          ) : null}
          <span>{t.timing[form.timing]}</span>
          {form.closesAt ? <span>{t.closesAt(formatDateTime(form.closesAt))}</span> : null}
          {item.submittedAt ? <span>{t.submittedAt(formatDateTime(item.submittedAt))}</span> : null}
        </div>
      </div>
      <Button asChild size="sm" variant={submitted || !item.canSubmit ? "outline" : "default"}>
        <Link href={`/portal/forms/${form.id}`}>
          {submitted ? (item.canSubmit ? t.edit : t.view) : t.fillIn}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
    </li>
  );
}
