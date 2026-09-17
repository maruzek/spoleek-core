"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { FolderIcon, Loader2Icon, PlusIcon, ShieldIcon, UserRoundIcon, UsersIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { EventAudienceDialog, type AudienceDraft } from "@/components/app/events/event-audience-dialog";
import { Button } from "@/components/ui/button";
import type { FormAudienceRuleInput } from "@/lib/forms/schemas";
import { cn } from "@/lib/utils";
import { setFormAudienceAction } from "@/server/actions/forms";
import type { FormAudienceScope } from "@/server/db/schema";

export type FormAudienceRow = {
  id: string;
  kind: "group" | "category" | "member";
  groupId: string | null;
  categoryId: string | null;
  memberId: string | null;
  scope: FormAudienceScope;
  label: string;
};

type Draft = FormAudienceRuleInput & { label: string };

function toDraft(row: FormAudienceRow): Draft | null {
  if (row.kind === "group" && row.groupId) return { kind: "group", groupId: row.groupId, scope: row.scope, label: row.label };
  if (row.kind === "category" && row.categoryId) return { kind: "category", categoryId: row.categoryId, scope: row.scope, label: row.label };
  if (row.kind === "member" && row.memberId) return { kind: "member", memberId: row.memberId, label: row.label };
  return null;
}

function toRule(d: Draft): FormAudienceRuleInput {
  switch (d.kind) {
    case "group":
      return { kind: "group", groupId: d.groupId, scope: d.scope };
    case "category":
      return { kind: "category", categoryId: d.categoryId, scope: d.scope };
    case "member":
      return { kind: "member", memberId: d.memberId };
  }
}

function draftKey(d: FormAudienceRuleInput) {
  switch (d.kind) {
    case "group":
      return `group:${d.groupId}:${d.scope}`;
    case "category":
      return `category:${d.categoryId}:${d.scope}`;
    case "member":
      return `member:${d.memberId}`;
  }
}

/** The picker dedupes on `kind:id`; scope is chosen on the chip afterwards. */
function pickerKey(d: FormAudienceRuleInput) {
  switch (d.kind) {
    case "group":
      return `group:${d.groupId}`;
    case "category":
      return `category:${d.categoryId}`;
    case "member":
      return `member:${d.memberId}`;
  }
}

const KIND_META = {
  category: { label: "Categories", icon: FolderIcon },
  group: { label: "Groups", icon: UsersIcon },
  member: { label: "Members", icon: UserRoundIcon },
} as const;

/**
 * Same rule editor as events, plus a members / admins toggle on group and
 * category chips: "the leaders of every troop" is a common audience for a
 * form and a rare one for an event.
 */
export function FormAudienceEditor({
  formId,
  rules,
  eligibleCount,
}: {
  formId: string;
  rules: FormAudienceRow[];
  eligibleCount: number;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(() => rules.map(toDraft).filter((d): d is Draft => d != null));
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const saveAction = useAction(setFormAudienceAction, {
    onSuccess() {
      toast.success("Audience saved.");
      setDirty(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save the audience.");
    },
  });

  const chosen = useMemo(() => new Set(drafts.map(pickerKey)), [drafts]);

  const addMany = (incoming: AudienceDraft[]) => {
    setDrafts((current) => {
      const have = new Set(current.map(pickerKey));
      const fresh = incoming
        .flatMap<Draft>((d) => {
          if (d.kind === "group") return [{ kind: "group", groupId: d.groupId, scope: "members", label: d.label }];
          if (d.kind === "category") return [{ kind: "category", categoryId: d.categoryId, scope: "members", label: d.label }];
          if (d.kind === "member") return [{ kind: "member", memberId: d.memberId, label: d.label }];
          return [];
        })
        .filter((d) => !have.has(pickerKey(d)));
      return fresh.length > 0 ? [...current, ...fresh] : current;
    });
    if (incoming.length > 0) setDirty(true);
  };
  const remove = (key: string) => {
    setDrafts((current) => current.filter((d) => draftKey(d) !== key));
    setDirty(true);
  };
  const toggleScope = (key: string) => {
    setDrafts((current) =>
      current.map((d) =>
        draftKey(d) === key && d.kind !== "member" ? { ...d, scope: d.scope === "admins" ? "members" : "admins" } : d,
      ),
    );
    setDirty(true);
  };
  const discard = () => {
    setDrafts(rules.map(toDraft).filter((d): d is Draft => d != null));
    setDirty(false);
  };

  return (
    <section className="rounded-xl border">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Audience</h3>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{eligibleCount}</span> members can fill it right now
            {dirty ? " · counts update after saving" : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Add rule
        </Button>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {drafts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No rules yet. Nobody can fill this form until you add one.
          </p>
        ) : (
          (["category", "group", "member"] as const).map((kind) => {
            const items = drafts.filter((d) => d.kind === kind);
            if (items.length === 0) return null;
            const meta = KIND_META[kind];
            return (
              <div key={kind} className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {meta.label} <span className="font-normal tabular-nums">{items.length}</span>
                </p>
                <ul className="flex flex-wrap gap-2">
                  {items.map((d) => {
                    const key = draftKey(d);
                    const admins = d.kind !== "member" && d.scope === "admins";
                    return (
                      <li
                        key={key}
                        className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-1 pl-2.5 text-sm shadow-xs"
                      >
                        <meta.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 truncate">{d.label}</span>
                        {d.kind !== "member" ? (
                          <button
                            type="button"
                            onClick={() => toggleScope(key)}
                            className={cn(
                              "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors",
                              admins
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
                            )}
                            aria-pressed={admins}
                            title={admins ? "Only admins of this " + kind : "Every member of this " + kind}
                          >
                            <ShieldIcon className="size-3" aria-hidden />
                            {admins ? "admins only" : "everyone"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Remove ${d.label}`}
                          className="ml-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          onClick={() => remove(key)}
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>

      {dirty ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-amber-500/5 px-4 py-2.5">
          <p className="text-sm text-amber-700 dark:text-amber-500">Unsaved changes</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={discard} disabled={saveAction.isPending}>
              Discard
            </Button>
            <Button size="sm" disabled={saveAction.isPending} onClick={() => saveAction.execute({ formId, rules: drafts.map(toRule) })}>
              {saveAction.isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              Save audience
            </Button>
          </div>
        </footer>
      ) : null}

      <EventAudienceDialog open={pickerOpen} excludeKeys={chosen} onOpenChange={setPickerOpen} onAdd={addMany} />
    </section>
  );
}
