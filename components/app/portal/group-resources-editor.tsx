"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, LinkIcon, PlusIcon, XIcon } from "lucide-react";

import { useDictionary } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { GROUP_RESOURCES_MAX, groupResourceSchema, type GroupResourceFormValues } from "@/lib/groups";
import { saveGroupResourcesAction } from "@/server/actions/group-page";

type ResourceRow = GroupResourceFormValues;

/**
 * Ordered list of label + link rows. The whole list is saved at once — the
 * action reconciles by id — so reordering is just moving array entries and
 * the server never sees a half-applied change.
 */
export function GroupResourcesEditor({
  groupId,
  resources,
  variant = "dialog",
}: {
  groupId: string;
  resources: ResourceRow[];
  variant?: "dialog" | "inline";
}) {
  const t = useDictionary().portalGroupPage;
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const save = useAction(saveGroupResourcesAction, {
    onSuccess() {
      toast.success(t.resourcesSaved);
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? t.failed);
    },
  });

  const form = useForm({
    defaultValues: { resources },
    onSubmit: async ({ value }) => {
      await save.executeAsync({ groupId, resources: value.resources });
    },
  });

  const body = (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="max-h-[60vh] overflow-y-auto px-1">
        <form.Field name="resources" mode="array">
          {(list) => (
            <ol className="flex flex-col gap-3">
              {list.state.value.map((_, index) => (
                <li
                  key={index}
                  className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]"
                >
                  <form.Field
                    name={`resources[${index}].label`}
                    validators={{
                      onBlur: ({ value }) => groupResourceSchema.shape.label.safeParse(value).error?.issues[0]?.message,
                    }}
                  >
                    {(field) => (
                      <Field data-invalid={field.state.meta.errors.length > 0} className="col-span-2 sm:col-span-1">
                        <FieldLabel htmlFor={field.name} className="sr-only">
                          {t.label}
                        </FieldLabel>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          placeholder={t.labelPlaceholder}
                          maxLength={80}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                        />
                        <FieldError errors={field.state.meta.errors.map((message) => ({ message: String(message) }))} />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field
                    name={`resources[${index}].url`}
                    validators={{
                      onBlur: ({ value }) => groupResourceSchema.shape.url.safeParse(value).error?.issues[0]?.message,
                    }}
                  >
                    {(field) => (
                      <Field data-invalid={field.state.meta.errors.length > 0} className="col-span-2 sm:col-span-1">
                        <FieldLabel htmlFor={field.name} className="sr-only">
                          {t.url}
                        </FieldLabel>
                        <Input
                          id={field.name}
                          type="url"
                          inputMode="url"
                          value={field.state.value}
                          placeholder={t.urlPlaceholder}
                          maxLength={2000}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                        />
                        <FieldError errors={field.state.meta.errors.map((message) => ({ message: String(message) }))} />
                      </Field>
                    )}
                  </form.Field>
                  <div className="col-span-2 flex items-start justify-end gap-0.5 sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.moveUp}
                      disabled={index === 0}
                      onClick={() => list.swapValues(index, index - 1)}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.moveDown}
                      disabled={index === list.state.value.length - 1}
                      onClick={() => list.swapValues(index, index + 1)}
                    >
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.remove}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => list.removeValue(index)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                </li>
              ))}
              <li>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={list.state.value.length >= GROUP_RESOURCES_MAX}
                  onClick={() => list.pushValue({ label: "", url: "" })}
                >
                  <PlusIcon data-icon="inline-start" />
                  {t.addLink}
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {list.state.value.length}/{GROUP_RESOURCES_MAX}
                  </span>
                </Button>
              </li>
            </ol>
          )}
        </form.Field>
      </div>
      <DialogFooter>
        {variant === "dialog" ? (
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            {t.cancel}
          </Button>
        ) : null}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {save.isPending ? t.saving : t.save}
        </Button>
      </DialogFooter>
    </form>
  );

  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.resourcesEditorDescription(GROUP_RESOURCES_MAX)}</p>
        {body}
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset({ resources });
      }}
    >
      <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" onClick={() => setOpen(true)}>
        <LinkIcon data-icon="inline-start" />
        {t.editLinks}
      </Button>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.resources}</DialogTitle>
          <DialogDescription>{t.resourcesEditorDescription(GROUP_RESOURCES_MAX)}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
