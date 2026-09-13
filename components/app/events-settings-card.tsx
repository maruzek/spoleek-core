"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventSettingsInput } from "@/lib/events/schemas";
import { saveEventSettingsAction } from "@/server/actions/organization-settings";

export type EventSettingsState = EventSettingsInput;

export function EventsSettingsCard({ state }: { state: EventSettingsState }) {
  const router = useRouter();
  const [creators, setCreators] = useState(state.orgEventCreators);
  const [retentionDays, setRetentionDays] = useState(state.eventGuestRetentionDays);

  const saveAction = useAction(saveEventSettingsAction, {
    onSuccess() {
      toast.success("Event settings saved.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save event settings.");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Events</p>

      <Field>
        <FieldLabel htmlFor="event-creators">Who can create organization-wide events</FieldLabel>
        <FieldContent>
          <Select value={creators} onValueChange={(v: EventSettingsInput["orgEventCreators"]) => setCreators(v)}>
            <SelectTrigger id="event-creators">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="org_admins">Organization admins only</SelectItem>
              <SelectItem value="category_admins">Organization and category admins</SelectItem>
              <SelectItem value="any_admin">Any admin, including group admins</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>
            Group and category events are always managed by their own admins; this only governs events owned by the
            whole organization.
          </FieldDescription>
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor="event-retention">Delete guest data after an event</FieldLabel>
        <FieldContent>
          <div className="flex items-center gap-2">
            <Input
              id="event-retention"
              type="number"
              min={1}
              max={3650}
              className="w-28"
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value) || 1)}
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          <FieldDescription>
            External invitees, RSVP links and guest names and emails are removed this long after the event ends.
            Headcounts and member responses are kept.
          </FieldDescription>
        </FieldContent>
      </Field>

      <div className="flex justify-end">
        <Button
          disabled={saveAction.isPending}
          onClick={() => saveAction.execute({ orgEventCreators: creators, eventGuestRetentionDays: retentionDays })}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
