import type { AudienceDraft } from "@/components/app/events/event-audience-dialog";
import type { EventInput } from "@/lib/events/schemas";

export type OwnerOptions = {
  organization: boolean;
  categories: { id: string; name: string }[];
  groups: { id: string; name: string; categoryId: string }[];
};

export type WizardStep = "basics" | "schedule" | "audience" | "review";

export const STEPS: WizardStep[] = ["basics", "schedule", "audience", "review"];

export const STEP_LABELS: Record<WizardStep, string> = {
  basics: "Basics",
  schedule: "When & where",
  audience: "Audience & places",
  review: "Review",
};

/** The event as the wizard edits it — the action input, minus nothing. */
export type EventDraft = EventInput;

export type EventWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owners: OwnerOptions;
  /** Present when editing; absent when creating. */
  event?: EventInput | null;
  /** Existing member rules when editing (externals are managed on the page). */
  audience?: AudienceDraft[];
  /** Called after a successful create or save with the event id. */
  onSaved: (eventId: string) => void;
};

export type FieldErrors = Partial<Record<keyof EventInput, string[]>>;

export function emptyDraft(): EventDraft {
  return {
    title: "",
    slug: "",
    descriptionHtml: null,
    ownerType: "organization",
    ownerCategoryId: null,
    ownerGroupId: null,
    visibility: "targeted",
    startsAt: null,
    endsAt: null,
    allDay: false,
    rsvpDeadlineAt: null,
    capacity: null,
    maxGuestsPerResponse: 0,
    locationName: null,
    locationAddress: null,
    communicationLink: null,
  };
}
