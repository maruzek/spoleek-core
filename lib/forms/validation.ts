import { type Dictionary, messages } from "@/lib/i18n/messages";
import { normalizeFieldInputValue } from "@/lib/member-custom-fields";
import type { MemberCustomFieldConstraints } from "@/lib/member-custom-field-constraints";
import type {
  CustomFieldValue,
  FormQuestion,
  MemberCustomField,
} from "@/server/db/schema";

/**
 * Submission validation, shared by every submit path.
 *
 * Each input question is normalized exactly as a custom field answer is, so a
 * form cannot accept a value the profile would reject. A linked question is
 * validated against the *live* custom field, not the snapshot stored on the
 * question row, because the snapshot only exists to survive the field's
 * deletion.
 */

/** The slice of `form_questions` validation needs. */
export type ValidationQuestion = Pick<
  FormQuestion,
  "id" | "kind" | "label" | "type" | "options" | "constraints" | "required" | "memberFieldId"
>;

/** The slice of the live custom field a linked question inherits. */
export type LiveField = Pick<MemberCustomField, "type" | "options" | "constraints">;

export type ValidationResult =
  | { ok: true; values: Map<string, CustomFieldValue> }
  | { ok: false; errors: Record<string, string> };

/**
 * The shape a question is validated as: its own type / options / constraints,
 * or the live field's when linked and the field still exists.
 */
export function resolveQuestionShape(
  question: Pick<ValidationQuestion, "type" | "options" | "constraints" | "memberFieldId">,
  liveFieldsById: ReadonlyMap<string, LiveField>,
): {
  type: NonNullable<ValidationQuestion["type"]>;
  options: string[];
  constraints: MemberCustomFieldConstraints;
} | null {
  const live = question.memberFieldId ? liveFieldsById.get(question.memberFieldId) : undefined;
  if (live) {
    return { type: live.type, options: live.options, constraints: live.constraints };
  }
  if (!question.type) return null;
  return { type: question.type, options: question.options, constraints: question.constraints };
}

export function validateSubmission(params: {
  questions: readonly ValidationQuestion[];
  liveFieldsById: ReadonlyMap<string, LiveField>;
  answers: Record<string, unknown>;
  dict?: Dictionary;
}): ValidationResult {
  const { questions, liveFieldsById, answers, dict = messages.en } = params;

  const errors: Record<string, string> = {};
  const values = new Map<string, CustomFieldValue>();
  const knownIds = new Set<string>();

  for (const question of questions) {
    knownIds.add(question.id);
    if (question.kind === "section") continue;

    const shape = resolveQuestionShape(question, liveFieldsById);
    if (!shape) {
      // A section-less input without a type cannot get past the DB CHECK;
      // treat it as a blank rather than crash on bad data.
      values.set(question.id, null);
      continue;
    }

    const { normalized, error } = normalizeFieldInputValue(
      {
        type: shape.type,
        required: question.required,
        label: question.label,
        key: question.id,
        constraints: shape.constraints,
      },
      answers[question.id],
      dict,
    );

    if (error) {
      errors[question.id] = error;
      continue;
    }

    const optionError = checkOptions(shape, question.label, normalized, dict);
    if (optionError) {
      errors[question.id] = optionError;
      continue;
    }

    values.set(question.id, normalized);
  }

  for (const id of Object.keys(answers)) {
    // A section id is "known" but takes no answer; reject it like a stranger.
    const question = questions.find((q) => q.id === id);
    if (!knownIds.has(id) || question?.kind === "section") {
      errors[id] = dict.validation.unknownQuestion;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values };
}

/**
 * `normalizeFieldInputValue` trusts select values because the profile widgets
 * only offer the listed options; a form is also filled by anonymous guests
 * posting whatever they like, so membership is checked here.
 */
function checkOptions(
  shape: { type: string; options: string[] },
  label: string,
  value: CustomFieldValue,
  dict: Dictionary,
): string | null {
  if (value === null) return null;
  if (shape.type === "select") {
    return typeof value === "string" && shape.options.includes(value)
      ? null
      : dict.validation.notAnOption(label);
  }
  if (shape.type === "multi_select") {
    return Array.isArray(value) && value.every((item) => shape.options.includes(item))
      ? null
      : dict.validation.notAnOption(label);
  }
  return null;
}
