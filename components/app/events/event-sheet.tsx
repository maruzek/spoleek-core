"use client";

import { EventForm, type EventValidationErrors, type OwnerOptions } from "@/components/app/events/event-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { EventInput } from "@/lib/events/schemas";

export function EventSheet({
  open,
  event,
  owners,
  isPending,
  validationErrors,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  event?: Partial<EventInput> | null;
  owners: OwnerOptions;
  isPending: boolean;
  validationErrors?: EventValidationErrors;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: EventInput) => Promise<void>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{event?.id ? "Edit event" : "New event"}</SheetTitle>
          <SheetDescription>
            Events start as drafts. Pick the audience and publish from the event page.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <EventForm
            key={event?.id ?? "new"}
            event={event}
            owners={owners}
            isPending={isPending}
            validationErrors={validationErrors}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
