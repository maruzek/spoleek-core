"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Loader2Icon } from "lucide-react";

import { EventDescriptionEditor } from "@/components/app/events/event-description-editor";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/events/display";
import { eventInputSchema, type EventInput } from "@/lib/events/schemas";
import { slugify } from "@/lib/slugify";

export type EventValidationErrors = Partial<Record<keyof EventInput, { _errors?: string[] }>>;

export type OwnerOptions = {
  organization: boolean;
  categories: { id: string; name: string }[];
  groups: { id: string; name: string; categoryId: string }[];
};

type OwnerKey = "organization" | `category:${string}` | `group:${string}`;

function toOwnerKey(value: Pick<EventInput, "ownerType" | "ownerCategoryId" | "ownerGroupId">): OwnerKey {
  if (value.ownerType === "category" && value.ownerCategoryId) return `category:${value.ownerCategoryId}`;
  if (value.ownerType === "group" && value.ownerGroupId) return `group:${value.ownerGroupId}`;
  return "organization";
}

function toDefaultValues(event?: Partial<EventInput> | null): EventInput {
  return {
    id: event?.id,
    title: event?.title ?? "",
    slug: event?.slug ?? "",
    descriptionHtml: event?.descriptionHtml ?? null,
    ownerType: event?.ownerType ?? "organization",
    ownerCategoryId: event?.ownerCategoryId ?? null,
    ownerGroupId: event?.ownerGroupId ?? null,
    visibility: event?.visibility ?? "targeted",
    startsAt: event?.startsAt ?? null,
    endsAt: event?.endsAt ?? null,
    allDay: event?.allDay ?? false,
    rsvpDeadlineAt: event?.rsvpDeadlineAt ?? null,
    capacity: event?.capacity ?? null,
    maxGuestsPerResponse: event?.maxGuestsPerResponse ?? 0,
    locationName: event?.locationName ?? null,
    locationAddress: event?.locationAddress ?? null,
    communicationLink: event?.communicationLink ?? null,
  };
}

export function EventForm({
  event,
  owners,
  isPending,
  validationErrors,
  onSubmit,
  onCancel,
}: {
  event?: Partial<EventInput> | null;
  owners: OwnerOptions;
  isPending: boolean;
  validationErrors?: EventValidationErrors;
  onSubmit: (value: EventInput) => Promise<void>;
  onCancel?: () => void;
}) {
  // The slug follows the title until it is edited by hand, same as groups.
  const [slugTouched, setSlugTouched] = useState(Boolean(event?.id));
  const [clientErrors, setClientErrors] = useState<EventValidationErrors>({});

  const form = useForm({
    defaultValues: toDefaultValues(event),
    onSubmit: async ({ value }) => {
      const parsed = eventInputSchema.safeParse(value);

      if (!parsed.success) {
        const flat = parsed.error.flatten().fieldErrors;
        setClientErrors(
          Object.fromEntries(
            Object.entries(flat).map(([key, messages]) => [key, { _errors: messages }]),
          ) as EventValidationErrors,
        );
        return;
      }

      setClientErrors({});
      await onSubmit(parsed.data);
    },
  });

  const errorsFor = (name: keyof EventInput) =>
    [...(clientErrors[name]?._errors ?? []), ...(validationErrors?.[name]?._errors ?? [])].map(
      (message) => ({ message }),
    );

  const ownerKeys: { key: OwnerKey; label: string }[] = [
    ...(owners.organization ? [{ key: "organization" as const, label: "Whole organization" }] : []),
    ...owners.categories.map((c) => ({ key: `category:${c.id}` as const, label: `Category · ${c.name}` })),
    ...owners.groups.map((g) => ({ key: `group:${g.id}` as const, label: `Group · ${g.name}` })),
  ];

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <div className="grid gap-5 md:grid-cols-2">
          <form.Field name="title">
            {(f) => (
              <Field data-invalid={errorsFor("title").length > 0}>
                <FieldLabel htmlFor="event-title">Title *</FieldLabel>
                <FieldContent>
                  <Input
                    id="event-title"
                    value={f.state.value}
                    onBlur={f.handleBlur}
                    onChange={(e) => {
                      f.handleChange(e.target.value);
                      if (!slugTouched) form.setFieldValue("slug", slugify(e.target.value));
                    }}
                  />
                  <FieldError errors={errorsFor("title")} />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="slug">
            {(f) => (
              <Field data-invalid={errorsFor("slug").length > 0}>
                <FieldLabel htmlFor="event-slug">Slug *</FieldLabel>
                <FieldContent>
                  <Input
                    id="event-slug"
                    value={f.state.value}
                    onBlur={f.handleBlur}
                    onChange={(e) => {
                      setSlugTouched(true);
                      f.handleChange(e.target.value);
                    }}
                  />
                  <FieldDescription>Used in the public and portal URL.</FieldDescription>
                  <FieldError errors={errorsFor("slug")} />
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <form.Subscribe selector={(s) => [s.values.ownerType, s.values.ownerCategoryId, s.values.ownerGroupId] as const}>
            {([ownerType, ownerCategoryId, ownerGroupId]) => (
              <Field data-invalid={errorsFor("ownerCategoryId").length > 0 || errorsFor("ownerGroupId").length > 0}>
                <FieldLabel htmlFor="event-owner">Organised by *</FieldLabel>
                <FieldContent>
                  <Select
                    value={toOwnerKey({ ownerType, ownerCategoryId, ownerGroupId })}
                    onValueChange={(key: OwnerKey) => {
                      if (key === "organization") {
                        form.setFieldValue("ownerType", "organization");
                        form.setFieldValue("ownerCategoryId", null);
                        form.setFieldValue("ownerGroupId", null);
                      } else if (key.startsWith("category:")) {
                        form.setFieldValue("ownerType", "category");
                        form.setFieldValue("ownerCategoryId", key.slice("category:".length));
                        form.setFieldValue("ownerGroupId", null);
                      } else {
                        form.setFieldValue("ownerType", "group");
                        form.setFieldValue("ownerGroupId", key.slice("group:".length));
                        form.setFieldValue("ownerCategoryId", null);
                      }
                    }}
                  >
                    <SelectTrigger id="event-owner">
                      <SelectValue placeholder="Pick an owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {ownerKeys.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>Decides who can manage the event and where it is listed.</FieldDescription>
                  <FieldError errors={[...errorsFor("ownerCategoryId"), ...errorsFor("ownerGroupId")]} />
                </FieldContent>
              </Field>
            )}
          </form.Subscribe>

          <form.Field name="visibility">
            {(f) => (
              <Field>
                <FieldLabel htmlFor="event-visibility">Who can see it *</FieldLabel>
                <FieldContent>
                  <Select value={f.state.value} onValueChange={(v: EventInput["visibility"]) => f.handleChange(v)}>
                    <SelectTrigger id="event-visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="targeted">Targeted — only the audience you pick</SelectItem>
                      <SelectItem value="org">Whole organization — every active member</SelectItem>
                      <SelectItem value="public">Public — anyone with the link</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </div>

        <form.Field name="descriptionHtml">
          {(f) => (
            <Field>
              <FieldLabel>Description</FieldLabel>
              <FieldContent>
                <EventDescriptionEditor initialHtml={f.state.value ?? ""} onChange={(html) => f.handleChange(html)} />
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <form.Field name="allDay">
          {(f) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="event-all-day">All-day event</FieldLabel>
                <FieldDescription>Hide times and show dates only.</FieldDescription>
              </FieldContent>
              <Switch id="event-all-day" checked={f.state.value} onCheckedChange={f.handleChange} />
            </Field>
          )}
        </form.Field>

        <form.Subscribe selector={(s) => s.values.allDay}>
          {(allDay) => (
            <div className="grid gap-5 md:grid-cols-3">
              <form.Field name="startsAt">
                {(f) => (
                  <Field data-invalid={errorsFor("startsAt").length > 0}>
                    <FieldLabel htmlFor="event-starts">Starts</FieldLabel>
                    <FieldContent>
                      <Input
                        id="event-starts"
                        type={allDay ? "date" : "datetime-local"}
                        value={allDay ? toDateTimeLocal(f.state.value).slice(0, 10) : toDateTimeLocal(f.state.value)}
                        onChange={(e) => f.handleChange(fromDateTimeLocal(e.target.value))}
                      />
                      <FieldError errors={errorsFor("startsAt")} />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>
              <form.Field name="endsAt">
                {(f) => (
                  <Field data-invalid={errorsFor("endsAt").length > 0}>
                    <FieldLabel htmlFor="event-ends">Ends</FieldLabel>
                    <FieldContent>
                      <Input
                        id="event-ends"
                        type={allDay ? "date" : "datetime-local"}
                        value={allDay ? toDateTimeLocal(f.state.value).slice(0, 10) : toDateTimeLocal(f.state.value)}
                        onChange={(e) => f.handleChange(fromDateTimeLocal(e.target.value))}
                      />
                      <FieldError errors={errorsFor("endsAt")} />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>
              <form.Field name="rsvpDeadlineAt">
                {(f) => (
                  <Field>
                    <FieldLabel htmlFor="event-deadline">Answer by</FieldLabel>
                    <FieldContent>
                      <Input
                        id="event-deadline"
                        type="datetime-local"
                        value={toDateTimeLocal(f.state.value)}
                        onChange={(e) => f.handleChange(fromDateTimeLocal(e.target.value))}
                      />
                      <FieldDescription>RSVP closes after this. Empty means until the event is over.</FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              </form.Field>
            </div>
          )}
        </form.Subscribe>

        <div className="grid gap-5 md:grid-cols-2">
          <form.Field name="locationName">
            {(f) => (
              <Field>
                <FieldLabel htmlFor="event-location-name">Location</FieldLabel>
                <FieldContent>
                  <Input id="event-location-name" value={f.state.value ?? ""} onChange={(e) => f.handleChange(e.target.value || null)} />
                </FieldContent>
              </Field>
            )}
          </form.Field>
          <form.Field name="locationAddress">
            {(f) => (
              <Field>
                <FieldLabel htmlFor="event-location-address">Address</FieldLabel>
                <FieldContent>
                  <Input id="event-location-address" value={f.state.value ?? ""} onChange={(e) => f.handleChange(e.target.value || null)} />
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </div>

        <form.Field name="communicationLink">
          {(f) => (
            <Field data-invalid={errorsFor("communicationLink").length > 0}>
              <FieldLabel htmlFor="event-chat">Chat link</FieldLabel>
              <FieldContent>
                <Input id="event-chat" type="url" placeholder="https://" value={f.state.value ?? ""} onChange={(e) => f.handleChange(e.target.value || null)} />
                <FieldDescription>WhatsApp, Facebook or similar. Shown to everyone who can see the event.</FieldDescription>
                <FieldError errors={errorsFor("communicationLink")} />
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <div className="grid gap-5 md:grid-cols-2">
          <form.Field name="capacity">
            {(f) => (
              <Field data-invalid={errorsFor("capacity").length > 0}>
                <FieldLabel htmlFor="event-capacity">Capacity</FieldLabel>
                <FieldContent>
                  <Input
                    id="event-capacity"
                    type="number"
                    min={1}
                    value={f.state.value ?? ""}
                    onChange={(e) => f.handleChange(e.target.value ? Number(e.target.value) : null)}
                  />
                  <FieldDescription>Confirmed places including guests. Empty means unlimited.</FieldDescription>
                  <FieldError errors={errorsFor("capacity")} />
                </FieldContent>
              </Field>
            )}
          </form.Field>
          <form.Field name="maxGuestsPerResponse">
            {(f) => (
              <Field data-invalid={errorsFor("maxGuestsPerResponse").length > 0}>
                <FieldLabel htmlFor="event-max-guests">Guests per person</FieldLabel>
                <FieldContent>
                  <Input
                    id="event-max-guests"
                    type="number"
                    min={0}
                    max={50}
                    value={f.state.value}
                    onChange={(e) => f.handleChange(Number(e.target.value) || 0)}
                  />
                  <FieldDescription>0 hides the guest picker.</FieldDescription>
                  <FieldError errors={errorsFor("maxGuestsPerResponse")} />
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </div>
      </FieldGroup>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {event?.id ? "Save changes" : "Create event"}
        </Button>
      </div>
    </form>
  );
}
