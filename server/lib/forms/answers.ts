import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { CustomFieldValue, FormAnswer, FormQuestion } from "@/server/db/schema";
import {
  canReadFieldValue,
  type FieldViewerAccess,
} from "@/server/lib/member-field-visibility";

/**
 * The one place that decides how an answer is stored and who gets it back.
 *
 * Special-category answers live only in `encryptedValue`, sealed with the
 * app key; everything else is plaintext so aggregates and exports stay SQL.
 * The DB CHECK forbids both columns being set, so a question that flips
 * sensitivity after answers exist has to be re-sealed by the caller — this
 * module never guesses from the row alone.
 */

export type SealQuestion = Pick<FormQuestion, "sensitivity">;
export type ReadQuestion = Pick<FormQuestion, "sensitivity" | "valueVisibility">;

export type SealedAnswer = Pick<FormAnswer, "value" | "encryptedValue">;

export function sealAnswer(question: SealQuestion, value: CustomFieldValue): SealedAnswer {
  if (question.sensitivity === "special_category") {
    return { value: null, encryptedValue: encryptSecret(JSON.stringify(value)) };
  }
  return { value, encryptedValue: null };
}

/** `"self"` is the submitter reading their own answers: never withheld. */
export type AnswerViewer = FieldViewerAccess | "self";

export type ReadAnswerResult =
  | { kind: "value"; value: CustomFieldValue }
  | { kind: "withheld" }
  | { kind: "empty" };

/**
 * Withholding comes before opening the envelope, so a scoped leader's read of
 * an org-admin-only answer never decrypts anything. `empty` covers both a
 * missing row and a shredded one.
 */
export function readAnswer(
  question: ReadQuestion,
  row: SealedAnswer | null | undefined,
  viewer: AnswerViewer,
): ReadAnswerResult {
  if (viewer !== "self" && !canReadFieldValue(question, viewer)) {
    if (row && (row.value !== null || row.encryptedValue !== null)) {
      return { kind: "withheld" };
    }
    return { kind: "empty" };
  }

  if (!row) return { kind: "empty" };

  if (row.encryptedValue !== null) {
    const value = JSON.parse(decryptSecret(row.encryptedValue)) as CustomFieldValue;
    return value === null ? { kind: "empty" } : { kind: "value", value };
  }

  return row.value === null ? { kind: "empty" } : { kind: "value", value: row.value };
}
