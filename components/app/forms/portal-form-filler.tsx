"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { CheckCircle2Icon, LockIcon } from "lucide-react";
import { toast } from "sonner";

import { FormFiller } from "@/components/app/forms/form-filler";
import { useDictionary, useFormatters, useLocale } from "@/components/locale-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FormOpenResult, CanSubmitResult } from "@/lib/forms/rules";
import { submitFormAction } from "@/server/actions/forms";
import type { CustomFieldValue, Form } from "@/server/db/schema";
import type { FillerQuestion } from "@/server/queries/forms";

export type PortalFillerData = {
  form: Pick<Form, "id" | "title" | "description" | "eventId">;
  questions: FillerQuestion[];
  open: FormOpenResult;
  canSubmit: CanSubmitResult;
  submittedAt: Date | null;
  answers: Record<string, CustomFieldValue>;
  prefill: Record<string, CustomFieldValue>;
};

/**
 * The member's filler: binds the shared filler to `submitForm`, shows why a
 * form cannot be submitted, and keeps a submitted form readable after it
 * closes.
 */
export function PortalFormFiller({ data, compact = false }: { data: PortalFillerData; compact?: boolean }) {
  const t = useDictionary().forms;
  const locale = useLocale();
  const { formatDateTime } = useFormatters();
  const router = useRouter();
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [justSaved, setJustSaved] = useState(false);

  const submit = useAction(submitFormAction, {
    onSuccess() {
      toast.success(data.submittedAt ? t.detail.updated : t.detail.saved);
      setJustSaved(true);
      router.refresh();
    },
    onError({ error }) {
      const answers = (error.validationErrors as { answers?: Record<string, { _errors?: string[] }> } | undefined)?.answers;
      if (answers) {
        setServerErrors(Object.fromEntries(Object.entries(answers).map(([id, v]) => [id, v?._errors?.[0] ?? ""])));
        toast.error(t.errors.INVALID_ANSWERS);
        return;
      }
      const code = error.serverError as keyof typeof t.errors | undefined;
      toast.error((code && t.errors[code]) ?? t.errors.generic);
    },
  });

  const submitted = data.submittedAt != null;
  const blocked = !data.canSubmit.ok ? data.canSubmit.reason : null;

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
  const initialValues = submitted ? data.answers : data.prefill;

  return (
    <div className={compact ? "flex flex-col gap-4" : "flex max-w-3xl flex-col gap-6"}>
      {notice}
      {data.form.description && !compact ? (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{data.form.description}</p>
      ) : null}
      {editable || submitted ? (
        <fieldset disabled={!editable} className="contents">
          <FormFiller
            key={`${data.form.id}:${data.submittedAt?.getTime() ?? "new"}:${justSaved}`}
            questions={data.questions}
            initialValues={initialValues}
            mode="member"
            serverErrors={serverErrors}
            submitting={submit.isPending}
            submitLabel={submitted ? t.detail.update : t.detail.submit}
            locale={locale}
            labels={{
              encrypted: t.detail.encrypted,
              saveToProfile: t.detail.saveToProfile,
              savedToProfile: t.detail.savedToProfile,
              yourName: t.public.yourName,
              yourEmail: t.public.yourEmail,
              nameRequired: "",
              emailInvalid: "",
            }}
            shredNote={(days) => t.detail.shredNote(days, data.form.eventId ? "event" : "deadline")}
            onSubmit={({ answers, syncToProfile }) => {
              if (!editable) return;
              setServerErrors({});
              submit.execute({ formId: data.form.id, answers, syncToProfile });
            }}
          />
        </fieldset>
      ) : null}
    </div>
  );
}
