"use client";

import { useMemo, useState } from "react";
import { GlobeIcon, PlusIcon, TargetIcon, UsersIcon } from "lucide-react";

import { AudienceRuleList, type AudienceKind, audienceDraftKey } from "@/components/app/events/audience-rule-list";
import { EventAudienceDialog, type AudienceDraft } from "@/components/app/events/event-audience-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EventInput } from "@/lib/events/schemas";
import { cn } from "@/lib/utils";

import type { EventDraft, FieldErrors } from "./types";

const VISIBILITY: { value: EventInput["visibility"]; icon: typeof UsersIcon; title: string; body: string }[] = [
  { value: "targeted", icon: TargetIcon, title: "Targeted", body: "Only the groups and members you pick." },
  { value: "org", icon: UsersIcon, title: "Whole organization", body: "Every active member sees it." },
  { value: "public", icon: GlobeIcon, title: "Public", body: "Anyone with the link, no account needed." },
];

export function StepAudience({
  draft,
  errors,
  eventId,
  rules,
  onChange,
  onRulesChange,
}: {
  draft: EventDraft;
  errors: FieldErrors;
  eventId?: string;
  rules: AudienceDraft[];
  onChange: (patch: Partial<EventDraft>) => void;
  onRulesChange: (rules: AudienceDraft[]) => void;
}) {
  const [picker, setPicker] = useState<{ open: boolean; kind?: AudienceKind }>({ open: false });
  const chosen = useMemo(() => new Set(rules.map(audienceDraftKey)), [rules]);
  const err = (k: keyof EventDraft) => (errors[k] ?? []).map((message) => ({ message }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Who is it for?</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Visibility decides who can open the page; the audience decides who counts as invited.
        </p>
      </div>

      <div role="radiogroup" aria-label="Who can see it" className="grid gap-2 sm:grid-cols-3">
        {VISIBILITY.map(({ value, icon: Icon, title, body }) => {
          const selected = draft.visibility === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ visibility: value })}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected
                  ? "border-primary/45 bg-primary/6 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-primary)_18%,transparent)]"
                  : "border-border hover:border-foreground/30 hover:bg-muted/40",
              )}
            >
              <Icon className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <span className="text-sm font-medium">{title}</span>
              <span className="text-xs text-muted-foreground">{body}</span>
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h3 className="font-sans text-sm font-semibold">Audience</h3>
            <p className="text-xs text-muted-foreground">
              {draft.visibility === "targeted"
                ? "Nobody can see the event until at least one rule matches them."
                : "Kept for invites and the “no answer” count; does not narrow who can see it."}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setPicker({ open: true })}>
            <PlusIcon data-icon="inline-start" />
            Add rule
          </Button>
        </header>
        <AudienceRuleList
          rules={rules}
          emptyText={`No rules yet. ${draft.visibility === "targeted" ? "Add a category, group or member." : "Everyone counts as invited."}`}
          onRemove={(key) => onRulesChange(rules.filter((x) => audienceDraftKey(x) !== key))}
          onAdd={(kind) => setPicker({ open: true, kind })}
        />
      </section>

      <EventAudienceDialog
        open={picker.open}
        eventId={eventId}
        excludeKeys={chosen}
        initialKind={picker.kind}
        onOpenChange={(open) => setPicker((p) => ({ ...p, open }))}
        onAdd={(incoming) => {
          const fresh = incoming.filter((d) => !chosen.has(audienceDraftKey(d)));
          if (fresh.length > 0) onRulesChange([...rules, ...fresh]);
        }}
      />

      <FieldGroup>
        <div className="grid gap-5 md:grid-cols-2">
          <Field data-invalid={err("capacity").length > 0}>
            <FieldLabel htmlFor="ew-capacity">Capacity</FieldLabel>
            <FieldContent>
              <Input
                id="ew-capacity"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={draft.capacity ?? ""}
                onChange={(e) => onChange({ capacity: e.target.value ? Number(e.target.value) : null })}
              />
              <FieldDescription>Confirmed places including guests. Empty means unlimited.</FieldDescription>
              <FieldError errors={err("capacity")} />
            </FieldContent>
          </Field>
          <Field data-invalid={err("maxGuestsPerResponse").length > 0}>
            <FieldLabel htmlFor="ew-guests">Guests per person</FieldLabel>
            <FieldContent>
              <Input
                id="ew-guests"
                type="number"
                min={0}
                max={50}
                value={draft.maxGuestsPerResponse}
                onChange={(e) => onChange({ maxGuestsPerResponse: Number(e.target.value) || 0 })}
              />
              <FieldDescription>0 hides the guest picker.</FieldDescription>
              <FieldError errors={err("maxGuestsPerResponse")} />
            </FieldContent>
          </Field>
        </div>
      </FieldGroup>
    </div>
  );
}
