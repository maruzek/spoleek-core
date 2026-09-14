import { STATUS_DOT_CLASSES, type StatusDotVariant } from "@/lib/status-dot";
import type { FormProfileSync, FormStatus, FormTiming } from "@/server/db/schema";

/**
 * Presentation helpers shared by admin, portal and public form pages. Pure —
 * no server imports — so client components can use them.
 */

export const formStatusDotVariant: Record<FormStatus, StatusDotVariant> = {
  draft: "default",
  open: "success",
  closed: "error",
};

export const FORM_STATUS_ORDER: FormStatus[] = ["open", "draft", "closed"];

export const FORM_STATUS_OPTIONS = FORM_STATUS_ORDER.map((status) => ({
  value: status,
  label: status.charAt(0).toUpperCase() + status.slice(1),
  dotClassName: STATUS_DOT_CLASSES[formStatusDotVariant[status]],
}));

export const formTimingLabel: Record<FormTiming, string> = {
  after_rsvp: "After RSVP",
  before_event: "Before the event",
  during_event: "During the event",
  after_event: "After the event",
  anytime: "Anytime",
};

export const formTimingHint: Record<FormTiming, string> = {
  after_rsvp: "Shown right under the RSVP once someone has answered.",
  before_event: "Nagged for until the event starts — transport, dietary needs.",
  during_event: "Surfaced from the start of the event — daily check-ins.",
  after_event: "Surfaced once the event is over — evaluations.",
  anytime: "Always listed. The default for forms without an event.",
};

export const FORM_TIMING_OPTIONS = (
  Object.keys(formTimingLabel) as FormTiming[]
).map((value) => ({ value, label: formTimingLabel[value], hint: formTimingHint[value] }));

export const formProfileSyncLabel: Record<FormProfileSync, string> = {
  none: "Never save to the profile",
  offer: "Offer to save (unticked)",
  offer_checked: "Offer to save (ticked)",
  always: "Always save to the profile",
};

export const FORM_PROFILE_SYNC_OPTIONS = (
  Object.keys(formProfileSyncLabel) as FormProfileSync[]
).map((value) => ({ value, label: formProfileSyncLabel[value] }));

export const formVisibilityLabel = {
  org: "Whole organization",
  targeted: "Targeted",
} as const;

export const formClosedReasonLabel = {
  draft: "This form is not open yet.",
  closed: "This form is closed.",
  deadline_passed: "The deadline for this form has passed.",
  event_cancelled: "The event was cancelled.",
  event_deleted: "The event no longer exists.",
} as const;
