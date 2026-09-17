"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { CheckCircle2Icon, CheckIcon, LockIcon } from "lucide-react";
import { toast } from "sonner";

import { FormFiller } from "@/components/app/forms/form-filler";
import { useDictionary, useFormatters, useLocale } from "@/components/locale-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CanSubmitResult, FormOpenResult } from "@/lib/forms/rules";
import { submitFormAsGuestAction, submitFormWithTokenAction } from "@/server/actions/forms";
import type { CustomFieldValue, Form } from "@/server/db/schema";
import type { FillerQuestion } from "@/server/queries/forms";

export type PublicFillerData = {
  form: Pick<Form, "id" | "title" | "description" | "eventId">;
  questions: FillerQuestion[];
  open: FormOpenResult;
  canSubmit: CanSubmitResult;
  submittedAt: Date | null;
  answers: Record<string, CustomFieldValue>;
};

export type PublicFillerSource = { kind: "guest"; eventSlug: string } | { kind: "token"; token: string };

/**
 * The signed-out filler: a guest on a public event (name + email first) or
 * a personal-link holder. Same widgets as the portal, no profile sync.
 */
export function PublicFormFiller({
  data,
  source,
  compact = false,
  onSubmitted,
}: {
  data: PublicFillerData;
  source: PublicFillerSource;
  compact?: boolean;
  onSubmitted?: () => void;
}) {
  const t = useDictionary().forms;
  const locale = useLocale();
  const { formatDateTime } = useFormatters();
  const router = useRouter();
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const handlers = {
    onSuccess() {
      toast.success(data.submittedAt ? t.detail.updated : t.detail.saved);
      setDone(true);
      router.refresh();
      onSubmitted?.();
    },
    onError({ error }: { error: { serverError?: string; validationErrors?: unknown } }) {
      const answers = (error.validationErrors as { answers?: Record<string, { _errors?: string[] }> } | undefined)?.answers;
      if (answers) {
        setServerErrors(Object.fromEntries(Object.entries(answers).map(([id, v]) => [id, v?._errors?.[0] ?? ""])));
        toast.error(t.errors.INVALID_ANSWERS);
        return;
      }
      const code = error.serverError as keyof typeof t.errors | undefined;
      toast.error((code && t.errors[code]) ?? t.errors.generic);
    },
  };
  const asGuest = useAction(submitFormAsGuestAction, handlers);
  const withToken = useAction(submitFormWithTokenAction, handlers);
  const submitting = asGuest.isPending || withToken.isPending;

  const submitted = data.submittedAt != null;
  const blocked = !data.canSubmit.ok ? data.canSubmit.reason : null;

  if (done && source.kind === "guest") {
    return (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-4" aria-hidden />
        </span>
        <p className="font-heading text-lg text-foreground">{t.public.thanks}</p>
      </div>
    );
  }

  const notice = !data.open.open ? (
    <Alert className="border-muted-foreground/20 bg-muted/40">
      <LockIcon />
      <AlertTitle>{t.detail.closed[data.open.reason]}</AlertTitle>
      {submitted ? <AlertDescription>{t.detail.readOnly}</AlertDescription> : null}
    </Alert>
  ) : blocked === "NOT_ELIGIBLE" || blocked === "RSVP_REQUIRED" ? (
    <Alert className="border-amber-500/30 bg-amber-500/5">
      <LockIcon className="text-amber-600 dark:text-amber-500" />
      <AlertTitle className="text-amber-700 dark:text-amber-500">{t.detail.cannotSubmit[blocked]}</AlertTitle>
    </Alert>
  ) : submitted ? (
    <Alert className="border-primary/30 bg-primary/5">
      <CheckCircle2Icon className="text-primary" />
      <AlertTitle>{t.detail.alreadySubmitted(formatDateTime(data.submittedAt))}</AlertTitle>
    </Alert>
  ) : null;

  const editable = data.canSubmit.ok;

  return (
    <div className={compact ? "flex flex-col gap-4" : "flex flex-col gap-6"}>
      {notice}
      {data.form.description && !compact ? (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{data.form.description}</p>
      ) : null}
      {editable || submitted ? (
        <fieldset disabled={!editable} className="contents">
          <FormFiller
            key={`${data.form.id}:${data.submittedAt?.getTime() ?? "new"}`}
            questions={data.questions}
            initialValues={data.answers}
            mode={source.kind}
            showSync={false}
            serverErrors={serverErrors}
            submitting={submitting}
            submitLabel={submitted ? t.detail.update : t.detail.submit}
            locale={locale}
            labels={{
              encrypted: t.detail.encrypted,
              saveToProfile: t.detail.saveToProfile,
              savedToProfile: t.detail.savedToProfile,
              yourName: t.public.yourName,
              yourEmail: t.public.yourEmail,
              nameRequired: t.public.nameRequired,
              emailInvalid: t.public.emailInvalid,
            }}
            shredNote={(days) => t.detail.shredNote(days, "event")}
            onSubmit={({ answers, guest }) => {
              if (!editable) return;
              setServerErrors({});
              if (source.kind === "guest") {
                asGuest.execute({ eventSlug: source.eventSlug, formId: data.form.id, name: guest!.name, email: guest!.email, answers });
              } else {
                withToken.execute({ token: source.token, formId: data.form.id, answers });
              }
            }}
          />
        </fieldset>
      ) : null}
    </div>
  );
}
