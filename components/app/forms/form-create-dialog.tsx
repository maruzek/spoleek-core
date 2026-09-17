"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { FilePlusIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import type { OwnerOptions } from "@/components/app/events/event-wizard/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createFormAction } from "@/server/actions/forms";
import type { EventOwnerType } from "@/server/db/schema";

export type EventOption = { id: string; title: string; startsAt: Date | null };
export type TemplateOption = { id: string; title: string; questionCount?: number };

type OwnerKey = "organization" | `category:${string}` | `group:${string}`;

function ownerOf(key: OwnerKey): { ownerType: EventOwnerType; ownerCategoryId: string | null; ownerGroupId: string | null } {
  if (key === "organization") return { ownerType: "organization", ownerCategoryId: null, ownerGroupId: null };
  if (key.startsWith("category:")) return { ownerType: "category", ownerCategoryId: key.slice(9), ownerGroupId: null };
  return { ownerType: "group", ownerGroupId: key.slice(6), ownerCategoryId: null };
}

const NONE = "__none__";

/**
 * Blank or from a template; owner; optional event. Everything else lives in
 * the editor, so the dialog stays one screen.
 */
export function FormCreateDialog({
  open,
  onOpenChange,
  owners,
  templates,
  events,
  asTemplate = false,
  /** Preselects and hides the event picker (event page "Attach form"). */
  fixedEventId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owners: OwnerOptions;
  templates: TemplateOption[];
  events: EventOption[];
  asTemplate?: boolean;
  fixedEventId?: string;
  onCreated: (formId: string) => void;
}) {
  const ownerKeys: { key: OwnerKey; label: string }[] = asTemplate
    ? [{ key: "organization", label: "Whole organization" }]
    : [
        ...(owners.organization ? [{ key: "organization" as const, label: "Whole organization" }] : []),
        ...owners.categories.map((c) => ({ key: `category:${c.id}` as const, label: `Category · ${c.name}` })),
        ...owners.groups.map((g) => ({ key: `group:${g.id}` as const, label: `Group · ${g.name}` })),
      ];

  const [title, setTitle] = useState("");
  const [source, setSource] = useState<"blank" | "template">("blank");
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? NONE);
  const [ownerKey, setOwnerKey] = useState<OwnerKey>(ownerKeys[0]?.key ?? "organization");
  const [eventId, setEventId] = useState<string>(fixedEventId ?? NONE);
  const [attempted, setAttempted] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setSource("blank");
      setTemplateId(templates[0]?.id ?? NONE);
      setOwnerKey(ownerKeys[0]?.key ?? "organization");
      setEventId(fixedEventId ?? NONE);
      setAttempted(false);
    }
  }

  const create = useAction(createFormAction, {
    onSuccess({ data }) {
      if (!data) return;
      toast.success(asTemplate ? "Template created." : "Form created as a draft.");
      onOpenChange(false);
      onCreated(data.formId);
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not create the form.");
    },
  });

  const titleError = attempted && title.trim().length < 2 ? "Title is required." : null;

  const submit = () => {
    setAttempted(true);
    if (title.trim().length < 2) return;
    create.execute({
      settings: {
        title: title.trim(),
        ...ownerOf(ownerKey),
        timing: "anytime",
        required: false,
        onlyRsvpYes: false,
        visibility: "org",
      },
      asTemplate,
      fromTemplateId: source === "template" && templateId !== NONE ? templateId : undefined,
      eventId: !asTemplate && eventId !== NONE ? eventId : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlusIcon className="size-4 text-muted-foreground" />
            {asTemplate ? "New template" : "New form"}
          </DialogTitle>
          <DialogDescription>
            {asTemplate
              ? "A template is a starting point: forms created from it copy its questions and never change with it."
              : "It starts as a draft only managers can see. Questions and settings come next."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={titleError != null}>
              <FieldLabel htmlFor="fc-title">Title</FieldLabel>
              <FieldContent>
                <Input
                  id="fc-title"
                  autoFocus
                  value={title}
                  placeholder={asTemplate ? "Camp registration" : "Summer camp 2026 — registration"}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-invalid={titleError != null}
                />
                <FieldError errors={titleError ? [{ message: titleError }] : []} />
              </FieldContent>
            </Field>

            {templates.length > 0 ? (
              <Field>
                <FieldLabel>Start from</FieldLabel>
                <FieldContent className="gap-3">
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={0}
                    value={source}
                    onValueChange={(v) => v && setSource(v as "blank" | "template")}
                    aria-label="Start from"
                  >
                    <ToggleGroupItem value="blank" className="px-3">
                      Blank
                    </ToggleGroupItem>
                    <ToggleGroupItem value="template" className="px-3">
                      Template
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {source === "template" ? (
                    <Select value={templateId} onValueChange={setTemplateId}>
                      <SelectTrigger aria-label="Template">
                        <SelectValue placeholder="Pick a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </FieldContent>
              </Field>
            ) : null}

            {ownerKeys.length > 1 ? (
              <Field>
                <FieldLabel htmlFor="fc-owner">Managed by</FieldLabel>
                <FieldContent>
                  <Select value={ownerKey} onValueChange={(v) => setOwnerKey(v as OwnerKey)}>
                    <SelectTrigger id="fc-owner">
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
                  <FieldDescription>Decides who can edit the form and see its answers.</FieldDescription>
                </FieldContent>
              </Field>
            ) : null}

            {!asTemplate && !fixedEventId && events.length > 0 ? (
              <Field>
                <FieldLabel htmlFor="fc-event">Event</FieldLabel>
                <FieldContent>
                  <Select value={eventId} onValueChange={setEventId}>
                    <SelectTrigger id="fc-event">
                      <SelectValue placeholder="No event" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No event — standalone form</SelectItem>
                      {events.map((ev) => (
                        <SelectItem key={ev.id} value={ev.id}>
                          {ev.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>A linked form is filled by whoever can see the event. You can attach one later too.</FieldDescription>
                </FieldContent>
              </Field>
            ) : null}
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              {asTemplate ? "Create template" : "Create draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
