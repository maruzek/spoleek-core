"use client";

import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The read-mostly sibling of `FormDialog`: same bordered header and scrolling
 * body, no footer. For a record's details, a preview, or a body that brings
 * its own submit button. Replaces the right-hand `Sheet` everywhere except
 * the mobile sidebar.
 */
export function DetailDialog({
  open,
  onOpenChange,
  title,
  titleAddon,
  description,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** A status pill or badge beside the title. */
  titleAddon?: ReactNode;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl", className)}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
          <div className="flex items-center gap-3">
            <DialogTitle>{title}</DialogTitle>
            {titleAddon}
          </div>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 py-5">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
