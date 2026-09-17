import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CalendarIcon, HourglassIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/messages";
import type { Event, Form } from "@/server/db/schema";

/** The white card for a signed-out filler: back link, form header, the filler. */
export function PublicFormCard({
  form,
  event,
  backHref,
  locale,
  timeZone,
  note,
  t,
  children,
}: {
  form: Pick<Form, "title" | "required" | "timing" | "closesAt">;
  event: Pick<Event, "title">;
  backHref: string;
  locale: string;
  timeZone: string;
  note?: ReactNode;
  t: Dictionary["forms"];
  children: ReactNode;
}) {
  const closesAt = form.closesAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(form.closesAt)
    : null;

  return (
    <article className="mx-auto w-full max-w-3xl rounded-2xl border bg-background p-6 shadow-sm md:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={backHref}>
            <ArrowLeftIcon data-icon="inline-start" />
            {t.detail.backToEvent}
          </Link>
        </Button>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </div>

      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {form.required ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-500">
              {t.requiredBadge}
            </Badge>
          ) : (
            <Badge variant="outline">{t.optionalBadge}</Badge>
          )}
          <Badge variant="outline">{t.timing[form.timing]}</Badge>
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{form.title}</h1>
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="size-3.5" aria-hidden />
            <dd>{t.forEvent(event.title)}</dd>
          </div>
          {closesAt ? (
            <div className="flex items-center gap-1.5">
              <HourglassIcon className="size-3.5" aria-hidden />
              <dd>{t.closesAt(closesAt)}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <div className="mt-8">{children}</div>
    </article>
  );
}
