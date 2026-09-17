"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { BanIcon, FolderIcon, SearchIcon, UserRoundIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AudienceRuleInput } from "@/lib/events/schemas";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { matchesSearch } from "@/lib/search";
import { cn } from "@/lib/utils";
import { loadEventAudienceOptionsAction } from "@/server/actions/events";

export type AudienceDraft = AudienceRuleInput & { label: string };

export type Kind = "category" | "group" | "member";

type Option = {
  key: string;
  kind: Kind;
  id: string;
  label: string;
  /** Second line: category name for a group, email for a member. */
  detail: string | null;
  initials: string;
};

const KIND_TABS: { value: Kind; label: string; icon: typeof UsersIcon }[] = [
  { value: "category", label: "Categories", icon: FolderIcon },
  { value: "group", label: "Groups", icon: UsersIcon },
  { value: "member", label: "Members", icon: UserRoundIcon },
];

function initialsOf(...parts: string[]) {
  return parts
    .map((p) => p.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

/**
 * Same shape as the group "Assign member" dialog so the two feel like one
 * control. Options are fetched when the dialog opens — nothing about the
 * org's member list rides along with the event page.
 */
export function EventAudienceDialog({
  open,
  eventId,
  excludeKeys,
  initialKind = "group",
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  /** Absent while the event is still being created. */
  eventId?: string;
  /** `kind:id` keys already in the draft — hidden from the list. */
  excludeKeys: Set<string>;
  /** Tab to open on — the rule list passes the section the "+ Add" sat in. */
  initialKind?: Kind;
  onOpenChange: (open: boolean) => void;
  onAdd: (drafts: AudienceDraft[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <EventAudienceDialogBody
          eventId={eventId}
          excludeKeys={excludeKeys}
          initialKind={initialKind}
          onOpenChange={onOpenChange}
          onAdd={onAdd}
        />
      ) : null}
    </Dialog>
  );
}

function EventAudienceDialogBody({
  eventId,
  excludeKeys,
  initialKind,
  onOpenChange,
  onAdd,
}: {
  eventId?: string;
  excludeKeys: Set<string>;
  initialKind: Kind;
  onOpenChange: (open: boolean) => void;
  onAdd: (drafts: AudienceDraft[]) => void;
}) {
  const searchId = useId();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const load = useAction(loadEventAudienceOptionsAction, {
    onError({ error }) {
      toast.error(error.serverError ?? "Could not load the options.");
    },
  });
  const { execute } = load;
  useEffect(() => {
    execute({ eventId });
  }, [execute, eventId]);

  const options = useMemo<Option[]>(() => {
    const data = load.result.data;
    if (!data) return [];
    const categoryNames = new Map(data.categories.map((c) => [c.id, c.name]));
    return [
      ...data.categories.map<Option>((c) => ({
        key: `category:${c.id}`,
        kind: "category",
        id: c.id,
        label: c.name,
        detail: "Every group in the category",
        initials: initialsOf(c.name),
      })),
      ...data.groups.map<Option>((g) => ({
        key: `group:${g.id}`,
        kind: "group",
        id: g.id,
        label: g.name,
        detail: categoryNames.get(g.categoryId) ?? null,
        initials: initialsOf(g.name),
      })),
      ...data.members.map<Option>((m) => ({
        key: `member:${m.id}`,
        kind: "member",
        id: m.id,
        label: getMemberDisplayName(m),
        detail: m.email ?? "No personal email",
        initials: initialsOf(m.firstName, m.lastName),
      })),
    ].filter((o) => !excludeKeys.has(o.key));
  }, [load.result.data, excludeKeys]);

  const filtered = useMemo(() => {
    const chosen = new Set(selected);
    return options
      .filter((o) => o.kind === kind)
      .filter((o) => matchesSearch(`${o.label} ${o.detail ?? ""}`, query))
      .sort((a, b) => {
        const sa = chosen.has(a.key) ? 0 : 1;
        const sb = chosen.has(b.key) ? 0 : 1;
        return sa - sb || a.label.localeCompare(b.label);
      });
  }, [options, kind, query, selected]);

  const countByKind = useMemo(() => {
    const chosen = new Set(selected);
    const out: Record<Kind, number> = { category: 0, group: 0, member: 0 };
    for (const o of options) if (chosen.has(o.key)) out[o.kind] += 1;
    return out;
  }, [options, selected]);

  const loading = load.result.data == null && !load.hasErrored;
  const hasSelection = selected.length > 0;

  const submit = () => {
    const chosen = new Set(selected);
    const drafts = options
      .filter((o) => chosen.has(o.key))
      .map<AudienceDraft>((o) =>
        o.kind === "category"
          ? { kind: "category", categoryId: o.id, label: o.label }
          : o.kind === "group"
            ? { kind: "group", groupId: o.id, label: o.label }
            : { kind: "member", memberId: o.id, label: o.label },
      );
    onAdd(drafts);
    onOpenChange(false);
  };

  return (
    <DialogContent className="max-w-3xl gap-0 overflow-hidden overscroll-contain p-0 sm:max-w-3xl" showCloseButton>
      <DialogHeader className="border-b bg-muted/30 px-6 pt-6 pb-4">
        <DialogTitle>Add to audience</DialogTitle>
        <DialogDescription className="max-w-2xl">
          Pick whole categories, single groups, or individual members. Rules combine — anyone matched by any rule is
          invited.
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (hasSelection) submit();
        }}
      >
        <div className="flex flex-col gap-4 px-6 pt-5 pb-4">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={kind}
            onValueChange={(v) => {
              if (v) {
                setKind(v as Kind);
                setQuery("");
              }
            }}
            aria-label="What to add"
          >
            {KIND_TABS.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value} className="gap-1.5 px-3">
                <t.icon className="size-3.5" aria-hidden />
                {t.label}
                {countByKind[t.value] > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
                    {countByKind[t.value]}
                  </span>
                ) : null}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={searchId}>Search {KIND_TABS.find((t) => t.value === kind)?.label.toLowerCase()}</FieldLabel>
              <FieldContent>
                <InputGroup className="h-11 rounded-xl border-input/60 bg-background shadow-xs">
                  <InputGroupAddon align="inline-start">
                    <SearchIcon aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id={searchId}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={kind === "member" ? "Type a name or email…" : "Type a name…"}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>
                      {loading ? "…" : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
                    </InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </FieldContent>
            </Field>
          </FieldGroup>

          <div className="flex flex-wrap items-center gap-2">
            {filtered.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelected((cur) => Array.from(new Set([...cur, ...filtered.map((o) => o.key)])))}
              >
                <UsersIcon data-icon="inline-start" aria-hidden="true" />
                Select all results
              </Button>
            ) : null}
            {hasSelection ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>
                <BanIcon data-icon="inline-start" aria-hidden="true" />
                Clear selection
              </Button>
            ) : null}
          </div>
        </div>

        <div className="px-6 pb-6">
          <ScrollArea className="h-[24rem] rounded-2xl border bg-background shadow-xs">
            <div className="flex flex-col gap-2 p-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3">
                    <Skeleton className="size-4 rounded" />
                    <Skeleton className="size-10 rounded-full" />
                    <div className="flex flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                ))
              ) : filtered.length > 0 ? (
                filtered.map((o) => {
                  const checked = selected.includes(o.key);
                  const inputId = `audience-option-${o.key}`;
                  return (
                    <label
                      key={o.key}
                      htmlFor={inputId}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors",
                        checked
                          ? "border-primary/45 bg-primary/6 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-primary)_18%,transparent)]"
                          : "border-transparent hover:border-border hover:bg-muted/60",
                      )}
                    >
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={() =>
                          setSelected((cur) => (checked ? cur.filter((k) => k !== o.key) : [...cur, o.key]))
                        }
                        aria-label={`Select ${o.label}`}
                      />
                      <Avatar size="lg">
                        <AvatarFallback>{o.initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-medium text-foreground">{o.label}</span>
                        {o.detail ? <span className="truncate text-sm text-muted-foreground">{o.detail}</span> : null}
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="flex h-[20rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 px-6 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full border bg-background">
                    <SearchIcon className="text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="font-medium text-foreground">
                      {query ? "Nothing matches this search" : "Nothing left to add here"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {query ? "Try a different name fragment." : "Everything in this list is already in the audience."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 px-8 py-4 pb-8">
          <div className="min-w-0 flex-1 text-sm font-medium text-muted-foreground">
            {hasSelection
              ? [
                  countByKind.category && `${countByKind.category} categor${countByKind.category === 1 ? "y" : "ies"}`,
                  countByKind.group && `${countByKind.group} group${countByKind.group === 1 ? "" : "s"}`,
                  countByKind.member && `${countByKind.member} member${countByKind.member === 1 ? "" : "s"}`,
                ]
                  .filter(Boolean)
                  .join(", ") + " ready to add"
              : "Choose who to invite"}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!hasSelection}>
              Add {selected.length} rule{selected.length === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
