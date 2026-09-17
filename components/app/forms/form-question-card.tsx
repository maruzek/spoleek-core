"use client";

import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  HeadingIcon,
  LinkIcon,
  LockIcon,
  ShieldAlertIcon,
  TextCursorInputIcon,
  Trash2Icon,
  UnlinkIcon,
} from "lucide-react";

import { EventDescriptionEditor } from "@/components/app/events/event-description-editor";
import { MemberCustomFieldConstraintFields } from "@/components/app/member-custom-field-constraint-fields";
import { SwitchChoiceField } from "@/components/app/switch-choice-field";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FieldHint } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FORM_PROFILE_SYNC_OPTIONS } from "@/lib/forms/display";
import {
  getFieldOptionList,
  memberCustomFieldArt9ConditionOptions,
  memberCustomFieldTypeOptions,
  memberCustomFieldVisibilityOptions,
  stringifyFieldOptions,
} from "@/lib/member-custom-fields";
import { cn } from "@/lib/utils";
import type {
  FormProfileSync,
  MemberCustomFieldArt9Condition,
  MemberCustomFieldType,
} from "@/server/db/schema";

import type { LinkableField, QuestionDraft, QuestionErrors } from "./types";

type LinkOption = { value: string; label: string; detail: string };

const NO_LINK: LinkOption = { value: "", label: "Not linked", detail: "" };

const TYPE_LABEL = Object.fromEntries(memberCustomFieldTypeOptions.map((o) => [o.value, o.label])) as Record<
  MemberCustomFieldType,
  string
>;

/**
 * One question. A linked question takes its type, options and constraints
 * from the profile field, so those controls lock; a special-category question
 * forces a TTL and cannot be linked, so those controls lock the other way.
 */
export function FormQuestionCard({
  draft,
  index,
  count,
  errors,
  linkableFields,
  hasShredAnchor,
  onChange,
  onMove,
  onRemove,
}: {
  draft: QuestionDraft;
  index: number;
  count: number;
  errors: QuestionErrors;
  linkableFields: LinkableField[];
  /** False when the form has no event dates and no deadline: TTLs never fire. */
  hasShredAnchor: boolean;
  onChange: (next: QuestionDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(Boolean(draft.descriptionHtml));
  const [optionsText, setOptionsText] = useState(() =>
    draft.kind === "input" ? stringifyFieldOptions(draft.options) : "",
  );

  const err = (name: string) => errors[name] ?? [];
  const id = (part: string) => `q-${draft.key}-${part}`;

  const header = (
    <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
      <span className="flex size-6 items-center justify-center rounded-md border bg-background text-xs font-semibold tabular-nums text-muted-foreground">
        {index + 1}
      </span>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {draft.kind === "section" ? (
          <>
            <HeadingIcon className="size-3.5" aria-hidden /> Section
          </>
        ) : (
          <>
            <TextCursorInputIcon className="size-3.5" aria-hidden /> {TYPE_LABEL[draft.type]}
            {draft.memberFieldId ? <LinkIcon className="size-3.5" aria-hidden /> : null}
            {draft.sensitivity === "special_category" ? <ShieldAlertIcon className="size-3.5 text-amber-600" aria-hidden /> : null}
          </>
        )}
      </span>
      <div className="ml-auto flex items-center gap-0.5">
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUpIcon />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
          <ArrowDownIcon />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove" onClick={onRemove}>
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );

  const helpText = (
    <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs">
          {helpOpen ? "Hide" : "Add"} {draft.kind === "section" ? "instructions" : "help text"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <EventDescriptionEditor
          initialHtml={draft.descriptionHtml ?? ""}
          onChange={(html) => onChange({ ...draft, descriptionHtml: html || null })}
        />
      </CollapsibleContent>
    </Collapsible>
  );

  if (draft.kind === "section") {
    return (
      <div className="rounded-xl border bg-card shadow-xs">
        {header}
        <div className="flex flex-col gap-3 p-4">
          <Field data-invalid={err("label").length > 0}>
            <FieldLabel htmlFor={id("label")}>Heading</FieldLabel>
            <FieldContent>
              <Input
                id={id("label")}
                value={draft.label}
                placeholder="Transport"
                onChange={(e) => onChange({ ...draft, label: e.target.value })}
                aria-invalid={err("label").length > 0}
              />
              <FieldError errors={err("label").map((message) => ({ message }))} />
            </FieldContent>
          </Field>
          {helpText}
        </div>
      </div>
    );
  }

  const linked = linkableFields.find((f) => f.id === draft.memberFieldId) ?? null;
  const special = draft.sensitivity === "special_category";
  const needsOptions = draft.type === "select" || draft.type === "multi_select";
  const linkOptions: LinkOption[] = [
    NO_LINK,
    ...linkableFields.map((f) => ({ value: f.id, label: f.label, detail: TYPE_LABEL[f.type] })),
  ];
  const linkValue = linkOptions.find((o) => o.value === (draft.memberFieldId ?? "")) ?? NO_LINK;

  const setLink = (fieldId: string | null) => {
    const field = fieldId ? linkableFields.find((f) => f.id === fieldId) ?? null : null;
    if (field) {
      setOptionsText(stringifyFieldOptions(field.options));
      onChange({
        ...draft,
        memberFieldId: field.id,
        type: field.type,
        options: field.options,
        constraints: field.constraints,
        profileSync: draft.profileSync === "none" ? "offer_checked" : draft.profileSync,
      });
    } else {
      onChange({ ...draft, memberFieldId: null, profileSync: "none" });
    }
  };

  return (
    <div className="rounded-xl border bg-card shadow-xs">
      {header}
      <div className="flex flex-col gap-5 p-4">
        <FieldGroup>
          <Field data-invalid={err("label").length > 0}>
            <FieldLabel htmlFor={id("label")}>Question</FieldLabel>
            <FieldContent>
              <Input
                id={id("label")}
                value={draft.label}
                placeholder="Any dietary requirements?"
                onChange={(e) => onChange({ ...draft, label: e.target.value })}
                aria-invalid={err("label").length > 0}
              />
              <FieldError errors={err("label").map((message) => ({ message }))} />
            </FieldContent>
          </Field>
          {helpText}

          <div className="grid gap-5 md:grid-cols-2">
            <Field data-invalid={err("memberFieldId").length > 0}>
              <FieldLabel htmlFor={id("link")}>
                Profile link
                <FieldHint>
                  A linked question uses the profile field&apos;s type and rules, is pre-filled from the member&apos;s
                  profile, and can write the answer back.
                </FieldHint>
              </FieldLabel>
              <FieldContent>
                <Combobox
                  items={linkOptions}
                  value={linkValue}
                  onValueChange={(next: LinkOption | null) => setLink(next?.value || null)}
                  itemToStringLabel={(item: LinkOption) => item.label}
                >
                  <ComboboxInput
                    id={id("link")}
                    placeholder="Not linked"
                    disabled={special}
                    showClear={!!draft.memberFieldId}
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>No field matches.</ComboboxEmpty>
                    <ComboboxList>
                      {(item: LinkOption) => (
                        <ComboboxItem key={item.value || "none"} value={item}>
                          <span className="flex items-center gap-2">
                            {item.value ? <LinkIcon className="size-3.5 text-muted-foreground" /> : <UnlinkIcon className="size-3.5 text-muted-foreground" />}
                            {item.label}
                            {item.detail ? <span className="text-xs text-muted-foreground">{item.detail}</span> : null}
                          </span>
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                {special ? (
                  <FieldDescription>Sensitive questions cannot be linked: profile values are not encrypted.</FieldDescription>
                ) : null}
                <FieldError errors={err("memberFieldId").map((message) => ({ message }))} />
              </FieldContent>
            </Field>

            {linked ? (
              <Field data-invalid={err("profileSync").length > 0}>
                <FieldLabel htmlFor={id("sync")}>Write back</FieldLabel>
                <FieldContent>
                  <Select
                    value={draft.profileSync}
                    onValueChange={(v) => onChange({ ...draft, profileSync: v as FormProfileSync })}
                  >
                    <SelectTrigger id={id("sync")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORM_PROFILE_SYNC_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={err("profileSync").map((message) => ({ message }))} />
                </FieldContent>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor={id("type")}>Answer type</FieldLabel>
                <FieldContent>
                  <Select
                    value={draft.type}
                    onValueChange={(v) => {
                      const type = v as MemberCustomFieldType;
                      const keepOptions = type === "select" || type === "multi_select";
                      onChange({ ...draft, type, options: keepOptions ? draft.options : [], constraints: {} });
                      if (!keepOptions) setOptionsText("");
                    }}
                  >
                    <SelectTrigger id={id("type")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {memberCustomFieldTypeOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          </div>

          {linked ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <LockIcon className="size-3" aria-hidden />
              Type, options and validation come from the profile field <span className="font-medium text-foreground">{linked.label}</span> ({TYPE_LABEL[linked.type]}).
            </p>
          ) : (
            <>
              {needsOptions ? (
                <Field data-invalid={err("options").length > 0}>
                  <FieldLabel htmlFor={id("options")}>
                    Options
                    <FieldHint>One option per line.</FieldHint>
                  </FieldLabel>
                  <FieldContent>
                    <Textarea
                      id={id("options")}
                      rows={4}
                      value={optionsText}
                      onBlur={(e) => setOptionsText(stringifyFieldOptions(getFieldOptionList(e.target.value)))}
                      onChange={(e) => {
                        setOptionsText(e.target.value);
                        onChange({ ...draft, options: getFieldOptionList(e.target.value) });
                      }}
                      aria-invalid={err("options").length > 0}
                    />
                    <FieldError errors={err("options").map((message) => ({ message }))} />
                  </FieldContent>
                </Field>
              ) : null}
              <MemberCustomFieldConstraintFields
                type={draft.type}
                value={draft.constraints}
                errors={err("constraints")}
                onChange={(constraints) => onChange({ ...draft, constraints })}
              />
            </>
          )}

          <SwitchChoiceField
            id={id("required")}
            title="Required"
            description="The form cannot be submitted without an answer."
            checked={draft.required}
            onCheckedChange={(required) => onChange({ ...draft, required })}
          />
        </FieldGroup>

        <FieldGroup className={cn("rounded-lg border p-4", special && "border-amber-500/30 bg-amber-500/5")}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Privacy</p>

          <SwitchChoiceField
            id={id("special")}
            title="Special-category data"
            description="Health, religion, ethnicity and the like. Answers are encrypted, never copied to the profile, and always deleted after a set time."
            checked={special}
            onCheckedChange={(checked) =>
              onChange({
                ...draft,
                sensitivity: checked ? "special_category" : "normal",
                memberFieldId: checked ? null : draft.memberFieldId,
                profileSync: checked ? "none" : draft.profileSync,
                valueVisibility: checked ? "org_admins" : draft.valueVisibility,
                art9Condition: checked ? draft.art9Condition : null,
                processingPurpose: checked ? draft.processingPurpose : null,
                shredAfterEventDays: checked ? draft.shredAfterEventDays ?? 30 : draft.shredAfterEventDays,
              })
            }
          />

          {special ? (
            <>
              <Field data-invalid={err("art9Condition").length > 0}>
                <FieldLabel htmlFor={id("art9")}>Why may the organization hold this?</FieldLabel>
                <FieldContent>
                  <Select
                    value={draft.art9Condition ?? undefined}
                    onValueChange={(v) => onChange({ ...draft, art9Condition: v as MemberCustomFieldArt9Condition })}
                  >
                    <SelectTrigger id={id("art9")}>
                      <SelectValue placeholder="Choose an Article 9(2) condition" />
                    </SelectTrigger>
                    <SelectContent>
                      {memberCustomFieldArt9ConditionOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {draft.art9Condition ? (
                    <FieldDescription>
                      {memberCustomFieldArt9ConditionOptions.find((o) => o.value === draft.art9Condition)?.description}
                    </FieldDescription>
                  ) : null}
                  <FieldError errors={err("art9Condition").map((message) => ({ message }))} />
                </FieldContent>
              </Field>
              <Field data-invalid={err("processingPurpose").length > 0}>
                <FieldLabel htmlFor={id("purpose")}>What is it for?</FieldLabel>
                <FieldContent>
                  <Textarea
                    id={id("purpose")}
                    rows={2}
                    value={draft.processingPurpose ?? ""}
                    placeholder="Allergies and medication for the camp kitchen and the first-aider."
                    onChange={(e) => onChange({ ...draft, processingPurpose: e.target.value })}
                    aria-invalid={err("processingPurpose").length > 0}
                  />
                  <FieldError errors={err("processingPurpose").map((message) => ({ message }))} />
                </FieldContent>
              </Field>
            </>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={id("visibility")}>Who may read the answers</FieldLabel>
              <FieldContent>
                <Select
                  value={draft.valueVisibility}
                  onValueChange={(v) => onChange({ ...draft, valueVisibility: v as "member_managers" | "org_admins" })}
                >
                  <SelectTrigger id={id("visibility")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {memberCustomFieldVisibilityOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field data-invalid={err("shredAfterEventDays").length > 0}>
              <FieldLabel htmlFor={id("shred")}>
                Delete answers after
                <FieldHint>
                  Days after the event ends (or after the deadline for a standalone form). Empty keeps answers with
                  the submission.
                </FieldHint>
              </FieldLabel>
              <FieldContent>
                <div className="flex items-center gap-2">
                  <Input
                    id={id("shred")}
                    type="number"
                    min={1}
                    max={3650}
                    className="w-28"
                    value={draft.shredAfterEventDays ?? ""}
                    placeholder={special ? "30" : "Never"}
                    onChange={(e) =>
                      onChange({ ...draft, shredAfterEventDays: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    aria-invalid={err("shredAfterEventDays").length > 0}
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                {draft.shredAfterEventDays != null && !hasShredAnchor ? (
                  <FieldDescription className="text-amber-700 dark:text-amber-500">
                    This form has no event dates and no deadline, so there is nothing to count from — answers will not
                    be deleted until one is set.
                  </FieldDescription>
                ) : null}
                <FieldError errors={err("shredAfterEventDays").map((message) => ({ message }))} />
              </FieldContent>
            </Field>
          </div>
        </FieldGroup>
      </div>
    </div>
  );
}
