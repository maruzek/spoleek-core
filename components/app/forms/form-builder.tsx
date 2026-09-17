"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { HeadingIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { FormQuestionCard } from "@/components/app/forms/form-question-card";
import { Button } from "@/components/ui/button";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { formQuestionSchema, type FormQuestionInput } from "@/lib/forms/schemas";
import { loadLinkableFieldsAction, setFormQuestionsAction } from "@/server/actions/forms";
import type { EditorQuestion } from "@/server/queries/forms";

import { emptyInput, emptySection, type LinkableField, type QuestionDraft, type QuestionErrors } from "./types";

const LINK_REASON: Record<string, string> = {
  special_category: "A sensitive question cannot be linked to a profile field.",
  field_not_found: "That profile field no longer exists.",
  field_inactive: "That profile field is inactive.",
  admin_only: "That profile field is admin-only, so members cannot answer it.",
  type_mismatch: "The profile field's type no longer matches this question.",
};

function toDraft(q: EditorQuestion): QuestionDraft {
  if (q.kind === "section") {
    return { key: q.id, id: q.id, kind: "section", label: q.label, descriptionHtml: q.descriptionHtml };
  }
  return {
    key: q.id,
    id: q.id,
    kind: "input",
    label: q.label,
    descriptionHtml: q.descriptionHtml,
    type: q.liveField?.type ?? q.type ?? "text",
    options: q.liveField?.options ?? q.options,
    constraints: q.liveField?.constraints ?? q.constraints,
    required: q.required,
    memberFieldId: q.liveField ? q.memberFieldId : null,
    profileSync: q.liveField ? q.profileSync : "none",
    sensitivity: q.sensitivity,
    art9Condition: q.art9Condition,
    processingPurpose: q.processingPurpose,
    valueVisibility: q.valueVisibility,
    shredAfterEventDays: q.shredAfterEventDays,
  };
}

function toInput(d: QuestionDraft): FormQuestionInput {
  const rest = { ...d } as Partial<QuestionDraft>;
  delete rest.key;
  return rest as FormQuestionInput;
}

function errorsOf(d: QuestionDraft): QuestionErrors {
  const parsed = formQuestionSchema.safeParse(toInput(d));
  if (parsed.success) return {};
  const out: QuestionErrors = {};
  for (const issue of parsed.error.issues) {
    const name = String(issue.path[0] ?? "");
    (out[name] ??= []).push(issue.message);
  }
  return out;
}

/**
 * The whole ordered list is one draft and one save, so reordering, adding
 * and editing never leave the form half-written. Existing ids ride along so
 * answers survive an edit.
 */
export function FormBuilder({
  formId,
  questions,
  hasShredAnchor,
  onDirtyChange,
}: {
  formId: string;
  questions: EditorQuestion[];
  hasShredAnchor: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<QuestionDraft[]>(() => questions.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<number, QuestionErrors>>({});
  const [linkable, setLinkable] = useState<LinkableField[]>([]);

  useUnsavedChanges(dirty);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const loadFields = useAction(loadLinkableFieldsAction, {
    onSuccess({ data }) {
      if (data) setLinkable(data.fields);
    },
  });
  const { execute: executeLoad } = loadFields;
  useEffect(() => {
    executeLoad({});
  }, [executeLoad]);

  const save = useAction(setFormQuestionsAction, {
    onSuccess() {
      toast.success("Questions saved.");
      setDirty(false);
      setAttempted(false);
      setServerErrors({});
      router.refresh();
    },
    onError({ error }) {
      const byIndex: Record<number, QuestionErrors> = {};
      const questionsErrors = (error.validationErrors as { questions?: Record<string, { memberFieldId?: { _errors?: string[] } }> } | undefined)?.questions;
      if (questionsErrors) {
        for (const [index, value] of Object.entries(questionsErrors)) {
          const raw = value?.memberFieldId?._errors?.[0];
          if (!raw) continue;
          const reason = raw.replace(/^QUESTION_LINK_INVALID:/, "");
          byIndex[Number(index)] = { memberFieldId: [LINK_REASON[reason] ?? "This link is not allowed."] };
        }
      }
      setServerErrors(byIndex);
      toast.error(error.serverError ?? "Check the highlighted questions.");
    },
  });

  const update = (next: QuestionDraft[]) => {
    setDrafts(next);
    setDirty(true);
  };

  const localErrors = useMemo(() => (attempted ? drafts.map(errorsOf) : drafts.map(() => ({}))), [attempted, drafts]);

  const submit = () => {
    setAttempted(true);
    if (drafts.some((d) => Object.keys(errorsOf(d)).length > 0)) {
      toast.error("Fix the highlighted questions.");
      return;
    }
    save.execute({ formId, questions: drafts.map(toInput) });
  };

  const discard = () => {
    setDrafts(questions.map(toDraft));
    setDirty(false);
    setAttempted(false);
    setServerErrors({});
  };

  const addButtons = (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => update([...drafts, emptyInput()])}>
        <PlusIcon data-icon="inline-start" />
        Add question
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => update([...drafts, emptySection()])}>
        <HeadingIcon data-icon="inline-start" />
        Add section
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {drafts.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <p className="font-heading text-lg">No questions yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Add a question for each thing you need to know. Link one to a profile field and the answer can be saved to
            the member&apos;s profile too.
          </p>
          {addButtons}
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {drafts.map((draft, index) => (
            <li key={draft.key}>
              <FormQuestionCard
                draft={draft}
                index={index}
                count={drafts.length}
                errors={{ ...localErrors[index], ...serverErrors[index] }}
                linkableFields={linkable}
                hasShredAnchor={hasShredAnchor}
                onChange={(next) => update(drafts.map((d, i) => (i === index ? next : d)))}
                onMove={(direction) => {
                  const target = index + direction;
                  if (target < 0 || target >= drafts.length) return;
                  const next = [...drafts];
                  [next[index], next[target]] = [next[target]!, next[index]!];
                  update(next);
                }}
                onRemove={() => update(drafts.filter((_, i) => i !== index))}
              />
            </li>
          ))}
        </ol>
      )}

      {drafts.length > 0 ? addButtons : null}

      {dirty ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-amber-500/5 px-4 py-2.5 shadow-md backdrop-blur">
          <p className="text-sm text-amber-700 dark:text-amber-500">Unsaved changes</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={discard} disabled={save.isPending}>
              Discard
            </Button>
            <Button size="sm" disabled={save.isPending} onClick={submit}>
              {save.isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              Save questions
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
