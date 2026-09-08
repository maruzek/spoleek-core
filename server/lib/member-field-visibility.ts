import type {
  MemberCustomField,
  MemberCustomFieldVisibility,
} from "@/server/db/schema";

/**
 * One place that decides whether a viewer may read a custom field's answers.
 *
 * Visibility is a property of every field, not a special case bolted onto the
 * sensitive ones: an organization decides per field who has a reason to read
 * it, and sensitivity is then something that informs that choice rather than a
 * parallel mechanism competing with it.
 *
 * Two rules hold everywhere, and neither is configurable:
 *
 * - **The member always reaches their own answers.** Through the portal, and
 *   through their Art. 15 export without exception. `stage: admin_only`
 *   controls whether they are *asked* for a value, never whether they may see
 *   one held about them.
 * - **A withheld value is never silent.** Callers render the field and the fact
 *   that an answer exists, without the answer. An empty field and a hidden one
 *   looking identical is how a leader concludes that nobody declared an
 *   allergy.
 */
export type FieldViewerAccess = "full" | "scoped";

const READABLE_BY: Record<MemberCustomFieldVisibility, FieldViewerAccess[]> = {
  member_managers: ["full", "scoped"],
  org_admins: ["full"],
};

export function canReadFieldValue(
  field: Pick<MemberCustomField, "valueVisibility">,
  viewer: FieldViewerAccess,
) {
  return READABLE_BY[field.valueVisibility].includes(viewer);
}

/** A field the viewer may see the existence of, but not the answer. */
export type RedactedField = {
  fieldId: string;
  key: string;
  label: string;
  /** True when an answer exists but is withheld from this viewer. */
  hasWithheldAnswer: boolean;
};

/**
 * Splits fields into the ones this viewer may read and the ones they may not.
 *
 * Returns both halves rather than filtering, because the caller has to render
 * the withheld ones — see the second rule above.
 */
export function partitionFieldsByVisibility<
  T extends Pick<MemberCustomField, "id" | "key" | "label" | "valueVisibility">,
>(fields: T[], viewer: FieldViewerAccess) {
  const readable: T[] = [];
  const withheld: T[] = [];

  for (const field of fields) {
    if (canReadFieldValue(field, viewer)) {
      readable.push(field);
    } else {
      withheld.push(field);
    }
  }

  return { readable, withheld };
}

/**
 * Strips withheld answers from a `key -> value` map, reporting what it removed.
 *
 * `answeredKeys` is what the caller needs to say "an answer was recorded" for a
 * field whose value it just dropped.
 */
export function redactAnswerMap<
  T extends Pick<MemberCustomField, "id" | "key" | "label" | "valueVisibility">,
>(
  fields: T[],
  answers: Record<string, unknown>,
  viewer: FieldViewerAccess,
): { answers: Record<string, unknown>; withheld: RedactedField[] } {
  const { withheld } = partitionFieldsByVisibility(fields, viewer);

  if (withheld.length === 0) {
    return { answers, withheld: [] };
  }

  const withheldKeys = new Set(withheld.map((field) => field.key));
  const redacted = Object.fromEntries(
    Object.entries(answers).filter(([key]) => !withheldKeys.has(key)),
  );

  return {
    answers: redacted,
    withheld: withheld.map((field) => ({
      fieldId: field.id,
      key: field.key,
      label: field.label,
      hasWithheldAnswer:
        answers[field.key] !== undefined &&
        answers[field.key] !== null &&
        answers[field.key] !== "",
    })),
  };
}
