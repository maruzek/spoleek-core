"use client";

import { useCallback, useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { CalendarPlusIcon, CheckIcon, Loader2Icon, PencilIcon } from "lucide-react";
import { toast } from "sonner";

import type { AudienceDraft } from "@/components/app/events/event-audience-dialog";
import { WizardFooter } from "@/components/app/wizard/wizard-footer";
import type { StepGate } from "@/components/app/wizard/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperList,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/ui/stepper";
import { eventInputSchema, type AudienceRuleInput } from "@/lib/events/schemas";
import { createEventAction, setEventAudienceAction, updateEventAction } from "@/server/actions/events";

import { StepAudience } from "./step-audience";
import { StepBasics } from "./step-basics";
import { StepReview } from "./step-review";
import { StepSchedule } from "./step-schedule";
import {
  emptyDraft,
  STEP_LABELS,
  STEPS,
  type EventDraft,
  type EventWizardProps,
  type FieldErrors,
  type WizardStep,
} from "./types";

/** Zod field errors → per-field message lists, only for the given keys. */
function errorsFor(draft: EventDraft, keys: (keyof EventDraft)[]): FieldErrors {
  const parsed = eventInputSchema.safeParse(draft);
  if (parsed.success) return {};
  const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: FieldErrors = {};
  for (const key of keys) if (flat[key]?.length) out[key] = flat[key];
  return out;
}

const STEP_FIELDS: Record<WizardStep, (keyof EventDraft)[]> = {
  basics: ["title", "slug", "ownerCategoryId", "ownerGroupId"],
  schedule: ["startsAt", "endsAt", "rsvpDeadlineAt", "communicationLink"],
  audience: ["capacity", "maxGuestsPerResponse"],
  review: [],
};

function toRule(d: AudienceDraft): AudienceRuleInput {
  switch (d.kind) {
    case "group":
      return { kind: "group", groupId: d.groupId };
    case "category":
      return { kind: "category", categoryId: d.categoryId };
    case "member":
      return { kind: "member", memberId: d.memberId };
    case "external":
      return { kind: "external", externalEmail: d.externalEmail, externalName: d.externalName };
  }
}

/**
 * Create or edit an event in four steps, audience included, so a new event
 * leaves the wizard ready to publish. External invitees stay on the event
 * page because each one mints a token.
 */
export function EventWizardDialog({ open, onOpenChange, owners, event, audience, onSaved }: EventWizardProps) {
  const isEdit = Boolean(event?.id);

  const [activeStep, setActiveStep] = useState<WizardStep>("basics");
  const [draft, setDraft] = useState<EventDraft>(() => event ?? emptyDraft());
  const [rules, setRules] = useState<AudienceDraft[]>(audience ?? []);
  const [slugTouched, setSlugTouched] = useState(isEdit);
  // Errors only show for steps the user has tried to leave.
  const [visited, setVisited] = useState<Set<WizardStep>>(() => new Set());
  const [saving, setSaving] = useState(false);

  // Reset when (re)opened, during render so the first frame is already fresh.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setActiveStep("basics");
      setDraft(event ?? emptyDraft());
      setRules(audience ?? []);
      setSlugTouched(isEdit);
      setVisited(new Set());
      setSaving(false);
    }
  }

  const patch = useCallback((p: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...p })), []);

  const stepErrors = useMemo(
    () => Object.fromEntries(STEPS.map((s) => [s, errorsFor(draft, STEP_FIELDS[s])])) as Record<WizardStep, FieldErrors>,
    [draft],
  );
  const shownErrors = (step: WizardStep) => (visited.has(step) ? stepErrors[step] : {});

  const createAction = useAction(createEventAction);
  const updateAction = useAction(updateEventAction);
  const audienceAction = useAction(setEventAudienceAction);

  const save = useCallback(async () => {
    const parsed = eventInputSchema.safeParse(draft);
    if (!parsed.success) {
      setVisited(new Set(STEPS));
      setActiveStep("basics");
      return;
    }
    setSaving(true);
    try {
      let eventId = event?.id;
      if (isEdit && eventId) {
        const result = await updateAction.executeAsync({ ...parsed.data, id: eventId });
        if (result?.serverError || result?.validationErrors) {
          toast.error(result.serverError ?? "Check the highlighted fields.");
          setVisited(new Set(STEPS));
          return;
        }
      } else {
        const result = await createAction.executeAsync(parsed.data);
        if (!result?.data?.success) {
          toast.error(result?.serverError ?? "Could not create the event.");
          setVisited(new Set(STEPS));
          return;
        }
        eventId = result.data.eventId;
      }
      // Member rules travel with the event; externals are added on the page.
      const memberRules = rules.filter((r) => r.kind !== "external").map(toRule);
      if (memberRules.length > 0 || isEdit) {
        const result = await audienceAction.executeAsync({ eventId: eventId!, rules: memberRules });
        if (result?.serverError) {
          toast.error("Event saved, but the audience could not be: " + result.serverError);
        }
      }
      toast.success(isEdit ? "Event updated." : "Event created as a draft.");
      onOpenChange(false);
      onSaved(eventId!);
    } finally {
      setSaving(false);
    }
  }, [draft, event?.id, isEdit, rules, createAction, updateAction, audienceAction, onOpenChange, onSaved]);

  const gates = useMemo<Record<WizardStep, StepGate>>(() => {
    const blockedBy = (step: WizardStep) =>
      Object.keys(stepErrors[step]).length > 0 ? { blocked: { reason: "Fix the highlighted fields to continue" } } : {};
    return {
      basics: visited.has("basics") ? blockedBy("basics") : {},
      schedule: visited.has("schedule") ? blockedBy("schedule") : {},
      audience: {
        ...(visited.has("audience") ? blockedBy("audience") : {}),
        ...(draft.visibility === "targeted" && rules.length === 0
          ? {
              pending: {
                summary: "No audience rules",
                detail: "The event is targeted, so nobody can see it until you add a category, group or member. You can do that later from the event page.",
              },
            }
          : {}),
      },
      review: { busy: saving },
    };
  }, [stepErrors, visited, draft.visibility, rules.length, saving]);

  const goTo = useCallback(
    (next: WizardStep) => {
      const from = activeStep;
      setVisited((v) => new Set(v).add(from));
      // Forward moves stop on an invalid step; backward moves always work.
      if (STEPS.indexOf(next) > STEPS.indexOf(from) && Object.keys(stepErrors[from]).length > 0) return;
      setActiveStep(next);
    },
    [activeStep, stepErrors],
  );
  const goNext = () => {
    const idx = STEPS.indexOf(activeStep);
    if (activeStep === "review") void save();
    else goTo(STEPS[idx + 1]!);
  };
  const goPrev = () => {
    const idx = STEPS.indexOf(activeStep);
    if (idx > 0) setActiveStep(STEPS[idx - 1]!);
  };

  const nextLabel =
    activeStep === "review" ? (isEdit ? "Save changes" : "Create draft") : activeStep === "audience" ? "Review" : "Continue";

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onInteractOutside={(e) => {
          if (saving) e.preventDefault();
          // Nested dialogs/popovers (audience picker, hover cards) must not close us.
          if (e.target instanceof Element && e.target.closest('[data-slot="dialog-content"],[data-slot="popover-content"]'))
            e.preventDefault();
        }}
        onEscapeKeyDown={(e) => saving && e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <PencilIcon className="size-4 text-muted-foreground" />
            ) : (
              <CalendarPlusIcon className="size-4 text-muted-foreground" />
            )}
            {isEdit ? "Edit event" : "New event"}
          </DialogTitle>
        </DialogHeader>

        <div className="shrink-0 border-b px-6 py-3">
          <Stepper value={activeStep} onValueChange={(v) => goTo(v as WizardStep)} className="gap-0">
            <StepperList className="gap-1">
              {STEPS.map((step, idx) => (
                <StepperItem key={step} value={step} className="shrink">
                  <StepperTrigger className="flex items-center gap-1.5 px-2 py-1">
                    <StepperIndicator className="size-5 rounded-full text-[10px]" />
                    <StepperTitle className="hidden text-xs sm:block">{STEP_LABELS[step]}</StepperTitle>
                  </StepperTrigger>
                  {idx < STEPS.length - 1 && <StepperSeparator className="mx-1 h-px flex-1 bg-border" />}
                </StepperItem>
              ))}
            </StepperList>
          </Stepper>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 py-5">
            {activeStep === "basics" && (
              <StepBasics
                draft={draft}
                errors={shownErrors("basics")}
                owners={owners}
                slugTouched={slugTouched}
                onChange={patch}
                onSlugTouched={() => setSlugTouched(true)}
              />
            )}
            {activeStep === "schedule" && <StepSchedule draft={draft} errors={shownErrors("schedule")} onChange={patch} />}
            {activeStep === "audience" && (
              <StepAudience
                draft={draft}
                errors={shownErrors("audience")}
                eventId={event?.id}
                rules={rules}
                onChange={patch}
                onRulesChange={setRules}
              />
            )}
            {activeStep === "review" && (
              <StepReview draft={draft} rules={rules} owners={owners} isEdit={isEdit} onEdit={setActiveStep} />
            )}
          </div>
        </div>

        <WizardFooter
          gate={gates[activeStep]}
          nextLabel={nextLabel}
          nextIcon={
            activeStep === "review" ? (
              saving ? (
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
              ) : (
                <CheckIcon data-icon="inline-start" />
              )
            ) : undefined
          }
          onBack={goPrev}
          backDisabled={activeStep === "basics" || saving}
          onNext={goNext}
        />
      </DialogContent>
    </Dialog>
  );
}
