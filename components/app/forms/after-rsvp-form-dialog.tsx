"use client";

import type { ReactNode } from "react";

import type { PortalFillerData } from "@/components/app/forms/portal-form-filler";
import { useDictionary } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The `after_rsvp` form as a modal. A required form cannot be dismissed —
 * no close button, no outside click, no Escape — so answering the
 * invitation and answering the form are one act. An optional one offers
 * "Later".
 */
export function AfterRsvpFormDialog({
  open,
  data,
  required,
  onOpenChange,
  filler,
}: {
  open: boolean;
  data: Pick<PortalFillerData, "form">;
  required: boolean;
  onOpenChange: (open: boolean) => void;
  /** The bound filler for this surface (portal member, token holder). */
  filler: (onSubmitted: () => void) => ReactNode;
}) {
  const t = useDictionary().forms;
  const lock = required;

  return (
    <Dialog open={open} onOpenChange={(next) => !lock && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!lock}
        onInteractOutside={(e) => lock && e.preventDefault()}
        onEscapeKeyDown={(e) => lock && e.preventDefault()}
      >
        <DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-500">{t.event.inlineTitle}</p>
          <DialogTitle className="font-heading text-xl">{data.form.title}</DialogTitle>
          <DialogDescription>{required ? t.event.dialogRequired : t.event.dialogOptional}</DialogDescription>
        </DialogHeader>
        {data.form.description ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{data.form.description}</p>
        ) : null}
        {filler(() => onOpenChange(false))}
        {!required ? (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {t.event.later}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
