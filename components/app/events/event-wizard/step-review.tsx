"use client";

import { PencilIcon } from "lucide-react";

import type { AudienceDraft } from "@/components/app/events/event-audience-dialog";
import { EventDateLeaf } from "@/components/app/events/event-date-leaf";
import { useFormatters } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { eventVisibilityLabel, formatEventWhen } from "@/lib/events/display";

import type { EventDraft, OwnerOptions, WizardStep } from "./types";

function Section({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: WizardStep;
  onEdit: (step: WizardStep) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <Button size="sm" variant="ghost" onClick={() => onEdit(step)}>
          <PencilIcon data-icon="inline-start" />
          Edit
        </Button>
      </header>
      <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">{children}</dl>
    </section>
  );
}

function Row({ label, children, muted }: { label: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={muted ? "text-muted-foreground" : "text-foreground"}>{children}</dd>
    </>
  );
}

export function StepReview({
  draft,
  rules,
  owners,
  isEdit,
  onEdit,
}: {
  draft: EventDraft;
  rules: AudienceDraft[];
  owners: OwnerOptions;
  isEdit: boolean;
  onEdit: (step: WizardStep) => void;
}) {
  const { locale, formatDateTime } = useFormatters();
  const when = formatEventWhen(
    { startsAt: draft.startsAt ?? null, endsAt: draft.endsAt ?? null, allDay: draft.allDay },
    locale,
  );
  const ownerName =
    draft.ownerType === "organization"
      ? "Whole organization"
      : draft.ownerType === "category"
        ? (owners.categories.find((c) => c.id === draft.ownerCategoryId)?.name ?? "Category")
        : (owners.groups.find((g) => g.id === draft.ownerGroupId)?.name ?? "Group");
  const members = rules.filter((r) => r.kind !== "external");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        <EventDateLeaf startsAt={draft.startsAt ?? null} locale={locale} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-muted-foreground">Organised by {ownerName}</p>
          <h2 className="font-heading text-2xl font-semibold tracking-tight">{draft.title || "Untitled event"}</h2>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Changes apply when you save." : "Created as a draft — nobody sees it until you publish from the event page."}
          </p>
        </div>
      </div>

      <Section title="When & where" step="schedule" onEdit={onEdit}>
        <Row label="When" muted={!when}>
          {when ?? "Date to be announced"}
          {draft.allDay ? " · all day" : ""}
        </Row>
        <Row label="Answer by" muted={!draft.rsvpDeadlineAt}>
          {draft.rsvpDeadlineAt ? formatDateTime(draft.rsvpDeadlineAt) : "Until the event is over"}
        </Row>
        <Row label="Where" muted={!draft.locationName && !draft.locationAddress}>
          {[draft.locationName, draft.locationAddress].filter(Boolean).join(", ") || "Location to be announced"}
        </Row>
        {draft.communicationLink ? (
          <Row label="Chat">
            <span className="truncate font-mono text-xs">{draft.communicationLink}</span>
          </Row>
        ) : null}
      </Section>

      <Section title="Audience & places" step="audience" onEdit={onEdit}>
        <Row label="Visibility">
          <Badge variant="outline">{eventVisibilityLabel[draft.visibility]}</Badge>
        </Row>
        <Row label="Rules" muted={members.length === 0}>
          {members.length === 0 ? (
            draft.visibility === "targeted" ? (
              <span className="text-amber-700 dark:text-amber-500">None — nobody will see this event yet.</span>
            ) : (
              "None"
            )
          ) : (
            <span className="flex flex-wrap gap-1">
              {members.map((r) => (
                <Badge key={`${r.kind}:${r.label}`} variant="secondary">
                  {r.label}
                </Badge>
              ))}
            </span>
          )}
        </Row>
        <Row label="Places">
          {draft.capacity ? `${draft.capacity} places` : "Unlimited"}
          {draft.maxGuestsPerResponse > 0
            ? ` · up to ${draft.maxGuestsPerResponse} guest${draft.maxGuestsPerResponse === 1 ? "" : "s"} per person`
            : " · no guests"}
        </Row>
      </Section>
    </div>
  );
}
