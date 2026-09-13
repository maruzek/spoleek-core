"use client";

import { EventDescriptionEditor } from "@/components/app/events/event-description-editor";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { slugify } from "@/lib/slugify";

import type { EventDraft, FieldErrors, OwnerOptions } from "./types";

type OwnerKey = "organization" | `category:${string}` | `group:${string}`;

function toOwnerKey(d: EventDraft): OwnerKey {
  if (d.ownerType === "category" && d.ownerCategoryId) return `category:${d.ownerCategoryId}`;
  if (d.ownerType === "group" && d.ownerGroupId) return `group:${d.ownerGroupId}`;
  return "organization";
}

export function StepBasics({
  draft,
  errors,
  owners,
  slugTouched,
  onChange,
  onSlugTouched,
}: {
  draft: EventDraft;
  errors: FieldErrors;
  owners: OwnerOptions;
  slugTouched: boolean;
  onChange: (patch: Partial<EventDraft>) => void;
  onSlugTouched: () => void;
}) {
  const ownerKeys: { key: OwnerKey; label: string }[] = [
    ...(owners.organization ? [{ key: "organization" as const, label: "Whole organization" }] : []),
    ...owners.categories.map((c) => ({ key: `category:${c.id}` as const, label: `Category · ${c.name}` })),
    ...owners.groups.map((g) => ({ key: `group:${g.id}` as const, label: `Group · ${g.name}` })),
  ];
  const err = (k: keyof EventDraft) => (errors[k] ?? []).map((message) => ({ message }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold">What is it?</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A name people will recognise, who runs it, and what to expect.
        </p>
      </div>

      <FieldGroup>
        <div className="grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Field data-invalid={err("title").length > 0}>
            <FieldLabel htmlFor="ew-title">Title</FieldLabel>
            <FieldContent>
              <Input
                id="ew-title"
                autoFocus
                value={draft.title}
                onChange={(e) =>
                  onChange({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })
                }
              />
              <FieldError errors={err("title")} />
            </FieldContent>
          </Field>
          <Field data-invalid={err("slug").length > 0}>
            <FieldLabel htmlFor="ew-slug">Link</FieldLabel>
            <FieldContent>
              <Input
                id="ew-slug"
                className="font-mono text-xs"
                value={draft.slug}
                onChange={(e) => {
                  onSlugTouched();
                  onChange({ slug: e.target.value });
                }}
              />
              <FieldDescription>/events/{draft.slug || "…"}</FieldDescription>
              <FieldError errors={err("slug")} />
            </FieldContent>
          </Field>
        </div>

        <Field data-invalid={err("ownerCategoryId").length > 0 || err("ownerGroupId").length > 0}>
          <FieldLabel htmlFor="ew-owner">Organised by</FieldLabel>
          <FieldContent>
            <Select
              value={toOwnerKey(draft)}
              onValueChange={(key: OwnerKey) => {
                if (key === "organization")
                  onChange({ ownerType: "organization", ownerCategoryId: null, ownerGroupId: null });
                else if (key.startsWith("category:"))
                  onChange({ ownerType: "category", ownerCategoryId: key.slice(9), ownerGroupId: null });
                else onChange({ ownerType: "group", ownerGroupId: key.slice(6), ownerCategoryId: null });
              }}
            >
              <SelectTrigger id="ew-owner" className="md:w-80">
                <SelectValue placeholder="Pick an owner" />
              </SelectTrigger>
              <SelectContent>
                {ownerKeys.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Decides who can manage the event and where it is listed.</FieldDescription>
            <FieldError errors={[...err("ownerCategoryId"), ...err("ownerGroupId")]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Description</FieldLabel>
          <FieldContent>
            <EventDescriptionEditor
              initialHtml={draft.descriptionHtml ?? ""}
              onChange={(html) => onChange({ descriptionHtml: html })}
            />
            <FieldDescription>Shown on the event page and in invites. Optional, but a line or two helps.</FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </div>
  );
}
