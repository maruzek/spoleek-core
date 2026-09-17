"use client";

import { PortalFormCard } from "@/components/app/forms/portal-form-card";
import { useDictionary } from "@/components/locale-provider";
import type { ViewerFormItem } from "@/server/queries/forms";

/** The "Forms" block on the portal event page. */
export function PortalEventForms({ items }: { items: ViewerFormItem[] }) {
  const t = useDictionary().forms;
  if (items.length === 0) return null;
  const pending = items.filter((item) => item.pending).length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight">{t.event.title}</h2>
        {pending > 0 ? (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-500">{t.event.pendingHint(pending)}</span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <PortalFormCard key={item.form.id} item={item} hideEvent />
        ))}
      </ul>
    </section>
  );
}
