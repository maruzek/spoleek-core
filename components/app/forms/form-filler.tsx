"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Loader2Icon, LockIcon, UserRoundCheckIcon } from "lucide-react";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { messages, type Locale } from "@/lib/i18n/messages";
import type { CustomFieldValue, MemberCustomField } from "@/server/db/schema";
import type { FillerQuestion } from "@/server/queries/forms";

export type FillerMode = "member" | "token" | "guest" | "proxy";

export type FillerLabels = {
  encrypted: string;
  saveToProfile: string;
  savedToProfile: string;
  yourName: string;
  yourEmail: string;
  nameRequired: string;
  emailInvalid: string;
};

const DEFAULT_LABELS: FillerLabels = {
  encrypted: messages.en.forms.detail.encrypted,
  saveToProfile: messages.en.forms.detail.saveToProfile,
  savedToProfile: messages.en.forms.detail.savedToProfile,
  yourName: messages.en.forms.public.yourName,
  yourEmail: messages.en.forms.public.yourEmail,
  nameRequired: "Name is required.",
  emailInvalid: "Enter a valid email address.",
};

export type FillerSubmit = {
  answers: Record<string, unknown>;
  syncToProfile: Record<string, boolean>;
  guest?: { name: string; email: string };
};

/**
 * One filler for every entry point: portal member, token holder, anonymous
 * guest and a manager typing on someone's behalf. Widgets are the custom
 * field widgets, so a linked question looks exactly like the profile field
 * it writes to.
 */
export function FormFiller({
  questions,
  initialValues,
  mode,
  showSync = mode === "member",
  serverErrors = {},
  submitting = false,
  submitLabel = "Submit",
  shredNote,
  locale = "en",
  labels = DEFAULT_LABELS,
  guestDefaults,
  footer,
  onSubmit,
}: {
  questions: FillerQuestion[];
  initialValues: Record<string, CustomFieldValue>;
  mode: FillerMode;
  /** Render the "save to my profile" checkboxes (member identities only). */
  showSync?: boolean;
  /** questionId → message from `INVALID_ANSWERS`. */
  serverErrors?: Record<string, string>;
  submitting?: boolean;
  submitLabel?: string;
  /** "(deleted N days after the event)" — built by the caller who knows the anchor. */
  shredNote?: (days: number) => string;
  locale?: Locale;
  labels?: FillerLabels;
  guestDefaults?: { name: string; email: string };
  /** Rendered left of the submit button. */
  footer?: ReactNode;
  onSubmit: (payload: FillerSubmit) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...initialValues }));
  const [sync, setSync] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      questions
        .filter((q) => q.kind === "input" && q.linked && q.profileSync !== "none")
        .map((q) => [q.id, q.profileSync === "offer_checked" || q.profileSync === "always"]),
    ),
  );
  const [guest, setGuest] = useState(guestDefaults ?? { name: "", email: "" });
  const [guestErrors, setGuestErrors] = useState<{ name?: string; email?: string }>({});

  const inputs = useMemo(() => questions.filter((q) => q.kind === "input"), [questions]);

  const submit = () => {
    if (mode === "guest") {
      const errors: { name?: string; email?: string } = {};
      if (guest.name.trim().length < 2) errors.name = labels.nameRequired;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email.trim())) errors.email = labels.emailInvalid;
      setGuestErrors(errors);
      if (Object.keys(errors).length > 0) return;
    }
    const answers: Record<string, unknown> = {};
    for (const q of inputs) answers[q.id] = values[q.id] ?? null;
    const syncToProfile: Record<string, boolean> = {};
    for (const q of inputs) {
      if (q.linked && q.profileSync !== "none" && q.profileSync !== "always") syncToProfile[q.id] = sync[q.id] === true;
    }
    onSubmit({ answers, syncToProfile, guest: mode === "guest" ? { name: guest.name.trim(), email: guest.email.trim() } : undefined });
  };

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        submit();
      }}
    >
      {mode === "guest" ? (
        <FieldGroup className="rounded-xl border bg-muted/30 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!guestErrors.name}>
              <FieldLabel htmlFor="ff-guest-name">{labels.yourName}</FieldLabel>
              <FieldContent>
                <Input
                  id="ff-guest-name"
                  autoComplete="name"
                  value={guest.name}
                  onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))}
                  aria-invalid={!!guestErrors.name}
                />
                <FieldError errors={guestErrors.name ? [{ message: guestErrors.name }] : []} />
              </FieldContent>
            </Field>
            <Field data-invalid={!!guestErrors.email}>
              <FieldLabel htmlFor="ff-guest-email">{labels.yourEmail}</FieldLabel>
              <FieldContent>
                <Input
                  id="ff-guest-email"
                  type="email"
                  autoComplete="email"
                  value={guest.email}
                  onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))}
                  aria-invalid={!!guestErrors.email}
                />
                <FieldError errors={guestErrors.email ? [{ message: guestErrors.email }] : []} />
              </FieldContent>
            </Field>
          </div>
        </FieldGroup>
      ) : null}

      <FieldGroup className="gap-6">
        {questions.map((q) => {
          if (q.kind === "section") {
            return (
              <div key={q.id} className="flex flex-col gap-1.5 border-b pb-3 pt-2 first:pt-0">
                <h3 className="font-heading text-lg font-semibold tracking-tight">{q.label}</h3>
                {q.descriptionHtml ? (
                  <div
                    className="policy-prose text-sm text-muted-foreground"
                    // Sanitized on write by server/lib/policy-html.ts; rendered verbatim.
                    dangerouslySetInnerHTML={{ __html: q.descriptionHtml }}
                  />
                ) : null}
              </div>
            );
          }
          if (!q.type) return null;

          const field = {
            id: q.id,
            key: q.id,
            label: q.label,
            description: null,
            type: q.type,
            required: q.required,
            options: q.options,
            constraints: q.constraints,
          } as unknown as MemberCustomField;
          const sensitive = q.sensitivity === "special_category";
          const offersSync = showSync && q.linked && (q.profileSync === "offer" || q.profileSync === "offer_checked");
          const alwaysSyncs = showSync && q.linked && q.profileSync === "always";

          return (
            <div key={q.id} className="flex flex-col gap-2">
              {q.descriptionHtml ? (
                <div
                  className="policy-prose text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: q.descriptionHtml }}
                />
              ) : null}
              <MemberCustomFieldInput
                field={field}
                value={values[q.id]}
                error={serverErrors[q.id]}
                locale={locale}
                onChange={(value) => setValues((v) => ({ ...v, [q.id]: value }))}
              />
              {sensitive ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LockIcon className="size-3" aria-hidden />
                  {labels.encrypted}
                  {q.shredAfterEventDays && shredNote ? ` · ${shredNote(q.shredAfterEventDays)}` : null}
                </p>
              ) : null}
              {offersSync ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={sync[q.id] === true}
                    onCheckedChange={(checked) => setSync((s) => ({ ...s, [q.id]: checked === true }))}
                  />
                  {labels.saveToProfile}
                </label>
              ) : alwaysSyncs ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UserRoundCheckIcon className="size-3" aria-hidden />
                  {labels.savedToProfile}
                </p>
              ) : null}
            </div>
          );
        })}
      </FieldGroup>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{footer}</div>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
