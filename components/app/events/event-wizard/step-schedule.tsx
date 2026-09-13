"use client";

import { DateTimeField } from "@/components/app/date-time-field";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import type { EventDraft, FieldErrors } from "./types";

export function StepSchedule({
  draft,
  errors,
  onChange,
}: {
  draft: EventDraft;
  errors: FieldErrors;
  onChange: (patch: Partial<EventDraft>) => void;
}) {
  const err = (k: keyof EventDraft) => (errors[k] ?? []).map((message) => ({ message }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold">When and where</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Everything can stay empty for a save-the-date; fill it in later.
        </p>
      </div>

      <FieldGroup>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="ew-all-day">All-day event</FieldLabel>
            <FieldDescription>Hide times and show dates only.</FieldDescription>
          </FieldContent>
          <Switch id="ew-all-day" checked={draft.allDay} onCheckedChange={(allDay) => onChange({ allDay })} />
        </Field>

        <div className="grid gap-5 md:grid-cols-2">
          <Field data-invalid={err("startsAt").length > 0}>
            <FieldLabel htmlFor="ew-starts">Starts</FieldLabel>
            <FieldContent>
              <DateTimeField
                id="ew-starts"
                value={draft.startsAt}
                dateOnly={draft.allDay}
                aria-invalid={err("startsAt").length > 0}
                onChange={(startsAt) => onChange({ startsAt })}
              />
              <FieldError errors={err("startsAt")} />
            </FieldContent>
          </Field>
          <Field data-invalid={err("endsAt").length > 0}>
            <FieldLabel htmlFor="ew-ends">Ends</FieldLabel>
            <FieldContent>
              <DateTimeField
                id="ew-ends"
                value={draft.endsAt}
                dateOnly={draft.allDay}
                aria-invalid={err("endsAt").length > 0}
                onChange={(endsAt) => onChange({ endsAt })}
              />
              <FieldError errors={err("endsAt")} />
            </FieldContent>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="ew-deadline">Answer by</FieldLabel>
          <FieldContent>
            <DateTimeField
              id="ew-deadline"
              value={draft.rsvpDeadlineAt}
              placeholder="No deadline"
              onChange={(rsvpDeadlineAt) => onChange({ rsvpDeadlineAt })}
            />
            <FieldDescription>RSVP closes after this. Empty means until the event is over.</FieldDescription>
          </FieldContent>
        </Field>

        <div className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ew-location">Location</FieldLabel>
            <FieldContent>
              <Input
                id="ew-location"
                placeholder="Clubhouse"
                value={draft.locationName ?? ""}
                onChange={(e) => onChange({ locationName: e.target.value || null })}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="ew-address">Address</FieldLabel>
            <FieldContent>
              <Input
                id="ew-address"
                placeholder="Street 1, City"
                value={draft.locationAddress ?? ""}
                onChange={(e) => onChange({ locationAddress: e.target.value || null })}
              />
            </FieldContent>
          </Field>
        </div>

        <Field data-invalid={err("communicationLink").length > 0}>
          <FieldLabel htmlFor="ew-chat">Chat link</FieldLabel>
          <FieldContent>
            <Input
              id="ew-chat"
              type="url"
              placeholder="https://"
              value={draft.communicationLink ?? ""}
              onChange={(e) => onChange({ communicationLink: e.target.value || null })}
            />
            <FieldDescription>WhatsApp, Facebook or similar. Shown to everyone who can see the event.</FieldDescription>
            <FieldError errors={err("communicationLink")} />
          </FieldContent>
        </Field>
      </FieldGroup>
    </div>
  );
}
