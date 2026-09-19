"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ArrowRightIcon, ClipboardListIcon, LinkIcon, Loader2Icon, PlusIcon, UnlinkIcon } from "lucide-react";
import { toast } from "sonner";

import type { OwnerOptions } from "@/components/app/events/event-wizard/types";
import { FormCreateDialog, type TemplateOption } from "@/components/app/forms/form-create-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { formStatusDotVariant, formTimingLabel } from "@/lib/forms/display";
import { attachFormToEventAction, detachFormFromEventAction } from "@/server/actions/forms";
import type { EventFormItem } from "@/server/queries/forms";

export type EventFormRow = EventFormItem & { submissionCount: number; pendingCount: number };

/**
 * The event's forms with attach / detach. Creating here preselects the
 * event; attaching lists the viewer's unlinked forms.
 */
export function EventFormsPanel({
  eventId,
  forms,
  unlinked,
  templates,
  owners,
}: {
  eventId: string;
  forms: EventFormRow[];
  unlinked: { id: string; title: string }[];
  templates: TemplateOption[];
  owners: OwnerOptions;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachId, setAttachId] = useState<string>(unlinked[0]?.id ?? "");

  const attach = useAction(attachFormToEventAction, {
    onSuccess() {
      toast.success("Form attached.");
      setAttachOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not attach the form.");
    },
  });
  const detach = useAction(detachFormFromEventAction, {
    onSuccess() {
      toast.success("Form detached.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not detach the form.");
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Registrations, dietary sheets, evaluations. Whoever can see the event can fill them.
        </p>
        <div className="flex gap-2">
          {unlinked.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => setAttachOpen(true)}>
              <LinkIcon data-icon="inline-start" />
              Attach existing
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            New form
          </Button>
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <ClipboardListIcon className="size-5 text-muted-foreground" aria-hidden />
          <p className="font-medium text-lg">No forms on this event</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Add one for anything a yes / no cannot answer. It starts as a draft and appears to invitees once you open it.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {forms.map((item) => (
            <li key={item.form.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link href={`/admin/forms/${item.form.id}`} className="truncate font-medium hover:underline">
                  {item.form.title}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Status variant={formStatusDotVariant[item.form.status]}>
                    <StatusIndicator />
                    <StatusLabel className="capitalize">{item.form.status}</StatusLabel>
                  </Status>
                  <Badge variant="outline">{formTimingLabel[item.form.timing]}</Badge>
                  {item.form.required ? <Badge variant="secondary">Required</Badge> : null}
                  {item.form.onlyRsvpYes ? <Badge variant="outline">Yes only</Badge> : null}
                </div>
              </div>
              <div className="text-right text-sm tabular-nums">
                <span className="font-medium">{item.submissionCount}</span>
                <span className="text-muted-foreground"> submitted</span>
                {item.pendingCount > 0 ? (
                  <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-500">{item.pendingCount} pending</span>
                ) : null}
              </div>
              <div className="flex gap-0.5">
                <Button size="icon-sm" variant="ghost" aria-label="Detach" disabled={detach.isPending} onClick={() => detach.execute({ formId: item.form.id })}>
                  <UnlinkIcon />
                </Button>
                <Button asChild size="icon-sm" variant="ghost" aria-label="Open form">
                  <Link href={`/admin/forms/${item.form.id}`}>
                    <ArrowRightIcon />
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormCreateDialog
        open={createOpen}
        owners={owners}
        templates={templates}
        events={[]}
        fixedEventId={eventId}
        onOpenChange={setCreateOpen}
        onCreated={(formId) => router.push(`/admin/forms/${formId}`)}
      />

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attach a form</DialogTitle>
            <DialogDescription>Standalone forms you manage. Once attached, the event decides who can fill it.</DialogDescription>
          </DialogHeader>
          <Select value={attachId} onValueChange={setAttachId}>
            <SelectTrigger aria-label="Form">
              <SelectValue placeholder="Pick a form" />
            </SelectTrigger>
            <SelectContent>
              {unlinked.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAttachOpen(false)} disabled={attach.isPending}>
              Cancel
            </Button>
            <Button disabled={!attachId || attach.isPending} onClick={() => attach.execute({ formId: attachId, eventId })}>
              {attach.isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              Attach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
