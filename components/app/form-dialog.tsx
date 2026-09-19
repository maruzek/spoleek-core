"use client";

import type { ReactNode } from "react";

import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The shell every create/edit form dialog shares with the event wizard: a
 * bordered header, a body that scrolls on its own, and a footer that stays
 * put. The form inside renders with `hideFooter` and an `id`; the footer's
 * submit button targets it with `form={id}`, so the form keeps owning
 * validation and the dialog keeps owning the chrome.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  formId,
  isPending,
  submitLabel,
  cancelLabel = "Cancel",
  footerStart,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  formId: string;
  isPending: boolean;
  submitLabel: string;
  cancelLabel?: string;
  /** Rendered at the footer's left edge, away from submit — a delete button, a hint. */
  footerStart?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl", className)}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            {icon ? <span className="text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 py-5">{children}</div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-6 py-4">
          <div className="flex items-center gap-2">{footerStart}</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              {cancelLabel}
            </Button>
            <Button type="submit" form={formId} disabled={isPending}>
              {isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              {isPending ? "Saving…" : submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
