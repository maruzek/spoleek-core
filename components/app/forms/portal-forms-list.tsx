"use client";

import { ClipboardListIcon } from "lucide-react";

import { PortalFormCard } from "@/components/app/forms/portal-form-card";
import { useDictionary } from "@/components/locale-provider";
import type { ViewerFormItem } from "@/server/queries/forms";

function Section({ title, empty, items }: { title: string; empty: string; items: ViewerFormItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title} {items.length > 0 ? <span className="font-normal tabular-nums">{items.length}</span> : null}
      </h2>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
          <ClipboardListIcon className="size-4" aria-hidden />
          {empty}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <PortalFormCard key={item.form.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function PortalFormsList({ pending, submitted }: { pending: ViewerFormItem[]; submitted: ViewerFormItem[] }) {
  const t = useDictionary().forms;
  return (
    <div className="flex flex-col gap-8">
      <Section title={t.sections.pending} empty={t.emptyPending} items={pending} />
      <Section title={t.sections.submitted} empty={t.emptySubmitted} items={submitted} />
    </div>
  );
}
