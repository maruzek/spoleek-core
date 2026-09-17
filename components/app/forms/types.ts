import type { FormQuestionInput } from "@/lib/forms/schemas";
import type { MemberCustomField } from "@/server/db/schema";

/** A question as the builder edits it: the action input plus a client key. */
export type QuestionDraft = FormQuestionInput & { key: string };

export type LinkableField = Pick<
  MemberCustomField,
  "id" | "key" | "label" | "type" | "options" | "constraints"
>;

export type QuestionErrors = Record<string, string[]>;

let counter = 0;
export function nextKey() {
  counter += 1;
  return `q-${Date.now().toString(36)}-${counter}`;
}

export function emptyInput(): QuestionDraft {
  return {
    key: nextKey(),
    kind: "input",
    label: "",
    descriptionHtml: null,
    type: "text",
    options: [],
    constraints: {},
    required: false,
    memberFieldId: null,
    profileSync: "none",
    sensitivity: "normal",
    art9Condition: null,
    processingPurpose: null,
    valueVisibility: "member_managers",
    shredAfterEventDays: null,
  };
}

export function emptySection(): QuestionDraft {
  return { key: nextKey(), kind: "section", label: "", descriptionHtml: null };
}
