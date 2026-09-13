import Link from "next/link";
import { CalendarIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatEventWhen } from "@/lib/events/display";
import type { Dictionary } from "@/lib/i18n/messages";
import type { ViewerEventItem } from "@/server/queries/events";

/** One portal section: heading + cards. Server component; strings come in via the dictionary. */
export function EventListSection({
  title,
  empty,
  items,
  locale,
  timeZone,
  t,
}: {
  title: string;
  empty: string;
  items: ViewerEventItem[];
  locale: string;
  timeZone: string;
  t: Dictionary["events"];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map(({ event, ownerName, response }) => (
            <li key={event.id}>
              <Link
                href={`/portal/events/${event.slug}`}
                className="flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{event.title}</span>
                  {event.status === "cancelled" ? (
                    <Badge variant="destructive">{t.cancelled}</Badge>
                  ) : response ? (
                    <Badge variant={response.answer === "yes" ? "default" : "secondary"}>
                      {t.answer[response.answer]}
                      {response.answer === "yes" && response.standing === "reserve" ? " · ⏳" : ""}
                    </Badge>
                  ) : null}
                </div>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarIcon className="size-3.5" aria-hidden />
                  {formatEventWhen(event, locale, timeZone) ?? t.dateTba}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.organisedBy(ownerName ?? t.wholeOrganization)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
