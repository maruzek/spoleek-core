import type { AudienceDraft } from "@/components/app/events/event-audience-dialog";
import type { EventInput } from "@/lib/events/schemas";

export type OwnerOptions = {
  organization: boolean;
  categories: { id: string; name: string }[];
  groups: { id: string; name: string; categoryId: string }[];
};

export type WizardStep = "basics" | "schedule" | "audience" | "payment" | "review";

export const STEPS: WizardStep[] = ["basics", "schedule", "audience", "payment", "review"];

export const STEP_LABELS: Record<WizardStep, string> = {
  basics: "Basics",
  schedule: "When & where",
  audience: "Audience & places",
  payment: "Payment",
  review: "Review",
};

/** The organization's fee settings, used as placeholders on the payment step. */
export type PaymentDefaults = {
  currency: string;
  bankAccount: string | null;
  /** Organization locale: a Czech org sees a local account-number placeholder, everyone else an IBAN. */
  locale: string;
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
  paymentDefaults: PaymentDefaults;
  /**
   * Responses currently charged (editing only). Turning the price off with
   * any of them asks for confirmation, since their pending payments go away.
   */
  chargedCount?: number;
  /** Called after a successful create or save with the event id. */
  onSaved: (eventId: string) => void;
};

export type FieldErrors = Partial<Record<keyof EventInput, string[]>>;

/**
 * The owner a fresh draft starts with: the organization when the viewer may
 * post org-wide, otherwise the first category or group they manage. A scoped
 * admin must never start on an owner the server will refuse.
 */
export function defaultOwner(owners: OwnerOptions): Pick<EventDraft, "ownerType" | "ownerCategoryId" | "ownerGroupId"> {
  if (owners.organization) return { ownerType: "organization", ownerCategoryId: null, ownerGroupId: null };
  const category = owners.categories[0];
  if (category) return { ownerType: "category", ownerCategoryId: category.id, ownerGroupId: null };
  const group = owners.groups[0];
  if (group) return { ownerType: "group", ownerCategoryId: null, ownerGroupId: group.id };
  return { ownerType: "organization", ownerCategoryId: null, ownerGroupId: null };
}

export function emptyDraft(owners?: OwnerOptions): EventDraft {
  return {
    title: "",
    slug: "",
    descriptionHtml: null,
    ...(owners ? defaultOwner(owners) : { ownerType: "organization", ownerCategoryId: null, ownerGroupId: null }),
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
    paid: false,
    priceAmount: null,
    priceCurrency: null,
    priceBankAccount: null,
    paymentDueAt: null,
  };
}
