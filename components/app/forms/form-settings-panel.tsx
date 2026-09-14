"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { CopyIcon, LayoutTemplateIcon, Loader2Icon, Trash2Icon, UnlinkIcon } from "lucide-react";
import { toast } from "sonner";

import { DateTimeField } from "@/components/app/date-time-field";
import type { OwnerOptions } from "@/components/app/events/event-wizard/types";
import { FormAudienceEditor, type FormAudienceRow } from "@/components/app/forms/form-audience-editor";
import { SwitchChoiceField } from "@/components/app/switch-choice-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { FORM_TIMING_OPTIONS, formVisibilityLabel } from "@/lib/forms/display";
import { formSettingsSchema, type FormSettingsInput } from "@/lib/forms/schemas";
import {
  deleteFormAction,
  detachFormFromEventAction,
  duplicateFormAction,
  saveFormAsTemplateAction,
  updateFormSettingsAction,
} from "@/server/actions/forms";
import type { Form, FormTiming, FormVisibility } from "@/server/db/schema";

type OwnerKey = "organization" | `category:${string}` | `group:${string}`;

function toOwnerKey(d: Pick<FormSettingsInput, "ownerType" | "ownerCategoryId" | "ownerGroupId">): OwnerKey {
  if (d.ownerType === "category" && d.ownerCategoryId) return `category:${d.ownerCategoryId}`;
  if (d.ownerType === "group" && d.ownerGroupId) return `group:${d.ownerGroupId}`;
  return "organization";
}

function toDraft(form: Form): FormSettingsInput {
  return {
    title: form.title,
    description: form.description,
    ownerType: form.ownerType,
    ownerCategoryId: form.ownerCategoryId,
    ownerGroupId: form.ownerGroupId,
    timing: form.timing,
    required: form.required,
    onlyRsvpYes: form.onlyRsvpYes,
    closesAt: form.closesAt,
    visibility: form.visibility,
  };
}

export function FormSettingsPanel({
  form,
  eventTitle,
  owners,
  audience,
  eligibleCount,
  canWrite,
  onDirtyChange,
}: {
  form: Form;
  eventTitle: string | null;
  owners: OwnerOptions;
  audience: FormAudienceRow[];
  eligibleCount: number;
  canWrite: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<FormSettingsInput>(() => toDraft(form));
  const [dirty, setDirtyState] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "detach" | "template" | null>(null);
  const [templateTitle, setTemplateTitle] = useState(form.title);

  useUnsavedChanges(dirty);
  const setDirty = (value: boolean) => {
    setDirtyState(value);
    onDirtyChange?.(value);
  };
  const patch = (p: Partial<FormSettingsInput>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  };

  const errors = useMemo(() => {
    if (!attempted) return {} as Record<string, string[]>;
    const parsed = formSettingsSchema.safeParse(draft);
    if (parsed.success) return {} as Record<string, string[]>;
    return parsed.error.flatten().fieldErrors as Record<string, string[]>;
  }, [attempted, draft]);
  const err = (name: string) => errors[name] ?? [];

  const refresh = (message: string) => ({
    onSuccess() {
      toast.success(message);
      setConfirm(null);
      router.refresh();
    },
    onError({ error }: { error: { serverError?: string } }) {
      toast.error(error.serverError ?? "Something went wrong.");
    },
  });

  const save = useAction(updateFormSettingsAction, {
    onSuccess() {
      toast.success("Settings saved.");
      setDirty(false);
      setAttempted(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save the settings.");
    },
  });
  const detach = useAction(detachFormFromEventAction, refresh("Form detached from the event."));
  const remove = useAction(deleteFormAction, {
    onSuccess() {
      toast.success("Form deleted.");
      router.push("/admin/forms");
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not delete the form.");
    },
  });
  const saveTemplate = useAction(saveFormAsTemplateAction, {
    onSuccess({ data }) {
      toast.success("Saved as a template.");
      setConfirm(null);
      if (data) router.push(`/admin/forms/${data.formId}`);
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save the template.");
    },
  });
  const duplicate = useAction(duplicateFormAction, {
    onSuccess({ data }) {
      toast.success("Copy created.");
      if (data) router.push(`/admin/forms/${data.formId}`);
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not duplicate the form.");
    },
  });

  const submit = () => {
    setAttempted(true);
    const parsed = formSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error("Fix the highlighted fields.");
      return;
    }
    save.execute({ formId: form.id, settings: parsed.data });
  };

  const ownerKeys: { key: OwnerKey; label: string }[] = [
    ...(owners.organization ? [{ key: "organization" as const, label: "Whole organization" }] : []),
    ...owners.categories.map((c) => ({ key: `category:${c.id}` as const, label: `Category · ${c.name}` })),
    ...owners.groups.map((g) => ({ key: `group:${g.id}` as const, label: `Group · ${g.name}` })),
  ];
  const linked = form.eventId != null;

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={!canWrite} className="contents">
          <FieldGroup className="rounded-xl border p-4">
            <Field data-invalid={err("title").length > 0}>
              <FieldLabel htmlFor="fs-title">Title</FieldLabel>
              <FieldContent>
                <Input id="fs-title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} aria-invalid={err("title").length > 0} />
                <FieldError errors={err("title").map((message) => ({ message }))} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="fs-description">Description</FieldLabel>
              <FieldContent>
                <Textarea
                  id="fs-description"
                  rows={3}
                  value={draft.description ?? ""}
                  placeholder="Shown above the questions."
                  onChange={(e) => patch({ description: e.target.value || null })}
                />
              </FieldContent>
            </Field>

            {!form.isTemplate && ownerKeys.length > 1 ? (
              <Field data-invalid={err("ownerCategoryId").length > 0 || err("ownerGroupId").length > 0}>
                <FieldLabel htmlFor="fs-owner">Managed by</FieldLabel>
                <FieldContent>
                  <Select
                    value={toOwnerKey(draft)}
                    onValueChange={(key: OwnerKey) => {
                      if (key === "organization") patch({ ownerType: "organization", ownerCategoryId: null, ownerGroupId: null });
                      else if (key.startsWith("category:")) patch({ ownerType: "category", ownerCategoryId: key.slice(9), ownerGroupId: null });
                      else patch({ ownerType: "group", ownerGroupId: key.slice(6), ownerCategoryId: null });
                    }}
                  >
                    <SelectTrigger id="fs-owner" className="md:w-80">
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
                  <FieldError errors={[...err("ownerCategoryId"), ...err("ownerGroupId")].map((message) => ({ message }))} />
                </FieldContent>
              </Field>
            ) : null}
          </FieldGroup>

          {!form.isTemplate ? (
            <FieldGroup className="rounded-xl border p-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">{linked ? "Event" : "Standalone form"}</p>
                {linked ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      Linked to <span className="font-medium text-foreground">{eventTitle ?? "an event"}</span>. Whoever can see the event can fill it.
                    </p>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm("detach")}>
                      <UnlinkIcon data-icon="inline-start" />
                      Detach
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Filled from the member portal. Attach it to an event from the event&apos;s Forms tab.</p>
                )}
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="fs-timing">When to fill it in</FieldLabel>
                  <FieldContent>
                    <Select value={draft.timing} onValueChange={(v) => patch({ timing: v as FormTiming })}>
                      <SelectTrigger id="fs-timing">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORM_TIMING_OPTIONS.filter((o) => linked || o.value === "anytime").map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>{FORM_TIMING_OPTIONS.find((o) => o.value === draft.timing)?.hint}</FieldDescription>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="fs-closes">Closes</FieldLabel>
                  <FieldContent>
                    <DateTimeField
                      id="fs-closes"
                      value={draft.closesAt ?? null}
                      placeholder="No deadline"
                      onChange={(closesAt) => patch({ closesAt })}
                    />
                    <FieldDescription>
                      Submissions stop after this.{!linked ? " Also the date answers with a TTL count from." : ""}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </div>

              <SwitchChoiceField
                id="fs-required"
                title="Required"
                description="Shows as pending for everyone who has not answered, and feeds the reminder list."
                checked={draft.required}
                onCheckedChange={(required) => patch({ required })}
              />
              {linked ? (
                <SwitchChoiceField
                  id="fs-rsvp"
                  title="Only for people who said yes"
                  description="Others see the form but cannot submit until their RSVP is a yes."
                  checked={draft.onlyRsvpYes}
                  onCheckedChange={(onlyRsvpYes) => patch({ onlyRsvpYes })}
                />
              ) : (
                <Field>
                  <FieldLabel htmlFor="fs-visibility">Who can fill it in</FieldLabel>
                  <FieldContent>
                    <Select value={draft.visibility} onValueChange={(v) => patch({ visibility: v as FormVisibility })}>
                      <SelectTrigger id="fs-visibility" className="md:w-80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(formVisibilityLabel) as FormVisibility[]).map((v) => (
                          <SelectItem key={v} value={v}>
                            {formVisibilityLabel[v]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {draft.visibility === "org" ? "Every active member." : "Only members matched by the audience rules below."}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            </FieldGroup>
          ) : null}
        </fieldset>

        {dirty && canWrite ? (
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-amber-500/5 px-4 py-2.5 shadow-md backdrop-blur">
            <p className="text-sm text-amber-700 dark:text-amber-500">Unsaved changes</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => {
                  setDraft(toDraft(form));
                  setDirty(false);
                  setAttempted(false);
                }}
              >
                Discard
              </Button>
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
                Save settings
              </Button>
            </div>
          </div>
        ) : null}
      </form>

      {!form.isTemplate && !linked && form.visibility === "targeted" && canWrite ? (
        <FormAudienceEditor formId={form.id} rules={audience} eligibleCount={eligibleCount} />
      ) : null}

      <section className="rounded-xl border">
        <header className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">More</h3>
        </header>
        <div className="flex flex-wrap gap-2 p-4">
          {!form.isTemplate ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("template")}>
              <LayoutTemplateIcon data-icon="inline-start" />
              Save as template
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={duplicate.isPending} onClick={() => duplicate.execute({ formId: form.id })}>
            <CopyIcon data-icon="inline-start" />
            Duplicate
          </Button>
          {canWrite ? (
            <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setConfirm("delete")}>
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          ) : null}
        </div>
      </section>

      <AlertDialog open={confirm != null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete" ? "Delete this form?" : confirm === "detach" ? "Detach from the event?" : "Save as a template?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "It disappears from every list, including the portal. Submissions stay for the retention period."
                : confirm === "detach"
                  ? "It becomes a standalone form filled from the portal. Existing submissions are kept."
                  : "The questions are copied into an organization-wide template. Later edits to either side do not affect the other."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "template" ? (
            <Field>
              <FieldLabel htmlFor="fs-template-title">Template name</FieldLabel>
              <FieldContent>
                <Input id="fs-template-title" value={templateTitle} onChange={(e) => setTemplateTitle(e.target.value)} />
              </FieldContent>
            </Field>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === "delete" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "delete") remove.execute({ formId: form.id });
                if (confirm === "detach") detach.execute({ formId: form.id });
                if (confirm === "template") saveTemplate.execute({ formId: form.id, title: templateTitle.trim() || undefined });
              }}
            >
              {confirm === "delete" ? "Delete" : confirm === "detach" ? "Detach" : "Save template"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
