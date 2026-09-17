"use client";

import { useId, useMemo, useState } from "react";
import { FolderIcon, PlusIcon, SearchIcon, UserRoundIcon, UsersIcon, XIcon } from "lucide-react";

import type { AudienceDraft } from "@/components/app/events/event-audience-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { matchesSearch } from "@/lib/search";
import { cn } from "@/lib/utils";

export type AudienceKind = "category" | "group" | "member";

/** Broad to narrow — a category folds many groups, a group many members. */
export const AUDIENCE_KINDS: AudienceKind[] = ["category", "group", "member"];

const KIND_META: Record<AudienceKind, { label: string; icon: typeof UsersIcon; hint: string | null }> = {
  category: { label: "Categories", icon: FolderIcon, hint: "every group in the category" },
  group: { label: "Groups", icon: UsersIcon, hint: null },
  member: { label: "Members", icon: UserRoundIcon, hint: null },
};

/** Filtering only earns its box once scanning by eye stops working. */
const FILTER_THRESHOLD = 8;

export function audienceDraftKey(d: AudienceDraft) {
  switch (d.kind) {
    case "group":
      return `group:${d.groupId}`;
    case "category":
      return `category:${d.categoryId}`;
    case "member":
      return `member:${d.memberId}`;
    case "external":
      return `external:${d.externalEmail}`;
  }
}

function initialsOf(label: string) {
  return label
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

function RuleRow({
  kind,
  label,
  onRemove,
  disabled,
}: {
  kind: AudienceKind;
  label: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const Icon = KIND_META[kind].icon;
  return (
    <li className="group flex min-w-0 items-center gap-2.5 rounded-lg py-1.5 pr-1 pl-2 transition-colors hover:bg-muted/60">
      {kind === "member" ? (
        <Avatar size="sm" className="shrink-0">
          <AvatarFallback className="text-[10px]">{initialsOf(label)}</AvatarFallback>
        </Avatar>
      ) : (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        disabled={disabled}
        className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-background hover:text-foreground focus-visible:text-foreground disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        onClick={onRemove}
      >
        <XIcon className="size-3.5" />
      </button>
    </li>
  );
}

/**
 * The saved rules of an event, one section per kind. Shared by the audience
 * tab and the wizard so both read the same way: rows sorted by name, a filter
 * box once the list gets long, and a per-section shortcut into the picker.
 * Externals are not shown here — they have their own section with the
 * email textarea.
 */
export function AudienceRuleList({
  rules,
  emptyText,
  disabled,
  onRemove,
  onAdd,
}: {
  rules: AudienceDraft[];
  emptyText: string;
  disabled?: boolean;
  onRemove: (key: string) => void;
  /** Opens the picker, optionally on a given tab. */
  onAdd: (kind?: AudienceKind) => void;
}) {
  const filterId = useId();
  const [query, setQuery] = useState("");

  const byKind = useMemo(() => {
    const out: Record<AudienceKind, AudienceDraft[]> = { category: [], group: [], member: [] };
    for (const r of rules) if (r.kind !== "external") out[r.kind].push(r);
    for (const kind of AUDIENCE_KINDS) out[kind].sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [rules]);

  const total = AUDIENCE_KINDS.reduce((n, kind) => n + byKind[kind].length, 0);
  const showFilter = total >= FILTER_THRESHOLD;
  const active = showFilter ? query.trim() : "";

  const visible = useMemo(() => {
    const out: Record<AudienceKind, AudienceDraft[]> = { category: [], group: [], member: [] };
    for (const kind of AUDIENCE_KINDS) out[kind] = byKind[kind].filter((r) => matchesSearch(r.label, active));
    return out;
  }, [byKind, active]);
  const visibleTotal = AUDIENCE_KINDS.reduce((n, kind) => n + visible[kind].length, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAdd()}>
          <PlusIcon data-icon="inline-start" />
          Add rule
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {showFilter ? (
        <div className="border-b px-4 py-3">
          <InputGroup className="h-9 bg-background">
            <InputGroupAddon align="inline-start">
              <SearchIcon aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              id={filterId}
              aria-label="Filter rules"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={`Filter ${total} rules…`}
            />
            {active ? (
              <InputGroupAddon align="inline-end">
                <button
                  type="button"
                  aria-label="Clear filter"
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setQuery("")}
                >
                  <XIcon className="size-3.5" />
                </button>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </div>
      ) : null}

      {visibleTotal === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing matches “{active}”.</p>
      ) : (
        AUDIENCE_KINDS.map((kind) => {
          const all = byKind[kind];
          const items = visible[kind];
          if (all.length === 0 || items.length === 0) return null;
          const meta = KIND_META[kind];
          return (
            <section key={kind} className="border-b px-3 py-3 last:border-b-0" aria-labelledby={`${filterId}-${kind}`}>
              <header className="flex items-center justify-between gap-3 px-2 pb-1.5">
                <p
                  id={`${filterId}-${kind}`}
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {meta.label}{" "}
                  <span className="font-normal tabular-nums">
                    {active ? `${items.length} of ${all.length}` : all.length}
                  </span>
                  {meta.hint ? <span className="ml-2 font-normal normal-case tracking-normal">· {meta.hint}</span> : null}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="-my-1 h-7 px-2 text-xs text-muted-foreground"
                  disabled={disabled}
                  onClick={() => onAdd(kind)}
                >
                  <PlusIcon data-icon="inline-start" />
                  Add
                </Button>
              </header>
              <ul className={cn("grid gap-x-3", kind === "member" && items.length > 4 && "sm:grid-cols-2")}>
                {items.map((r) => (
                  <RuleRow
                    key={audienceDraftKey(r)}
                    kind={kind}
                    label={r.label}
                    disabled={disabled}
                    onRemove={() => onRemove(audienceDraftKey(r))}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
