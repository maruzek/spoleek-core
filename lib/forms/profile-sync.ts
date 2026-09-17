import type {
  CustomFieldValue,
  FormQuestion,
  MemberCustomField,
} from "@/server/db/schema";

/**
 * Which answers flow back into the member's profile, and which links are
 * allowed to exist at all. Pure; the action layer applies the writes through
 * the custom-field upsert so the field's own constraints run again.
 */

export type SyncQuestion = Pick<
  FormQuestion,
  "id" | "kind" | "memberFieldId" | "profileSync" | "sensitivity"
>;

export type ProfileWrite = { fieldId: string; value: CustomFieldValue };

export type IdentityKind = "member" | "token" | "guest";

/**
 * Only member identities have a profile. A token holder may be a member too,
 * but a login-free link is not the place to rewrite a profile; the portal is.
 *
 * `always` writes unconditionally; `offer` and `offer_checked` write only when
 * the filler left the checkbox ticked (`syncFlags[questionId] === true`) —
 * `offer_checked` differs only in the checkbox's default, so an explicit
 * untick is respected. An empty answer never writes: leaving a question
 * blank on a camp form must not erase a phone number from the profile.
 * Special-category questions never sync (they cannot be linked either).
 */
export function resolveProfileWrites(params: {
  questions: readonly SyncQuestion[];
  values: ReadonlyMap<string, CustomFieldValue>;
  syncFlags: Record<string, boolean>;
  identityKind: IdentityKind;
}): ProfileWrite[] {
  const { questions, values, syncFlags, identityKind } = params;
  if (identityKind !== "member") return [];

  const writes: ProfileWrite[] = [];
  for (const question of questions) {
    if (question.kind !== "input") continue;
    if (!question.memberFieldId || question.profileSync === "none") continue;
    if (question.sensitivity !== "normal") continue;

    const value = values.get(question.id);
    if (value === undefined || value === null) continue;

    const wanted =
      question.profileSync === "always" || syncFlags[question.id] === true;
    if (!wanted) continue;

    writes.push({ fieldId: question.memberFieldId, value });
  }
  return writes;
}

export type QuestionLinkInvalidReason =
  | "special_category"
  | "field_not_found"
  | "field_inactive"
  | "admin_only"
  | "type_mismatch";

/**
 * Whether a question may be linked to `field`. Null means yes.
 *
 * `type_mismatch` only fires when the question already carries a type that
 * differs from the field's — a fresh link adopts the field's type. It exists
 * for the case where the field's type was changed after the link was made
 * and the stored answers no longer fit.
 */
export function validateQuestionLink(
  question: Pick<SyncQuestion, "sensitivity"> & { type: FormQuestion["type"] | null },
  field: Pick<MemberCustomField, "type" | "stage" | "isActive"> | null,
): QuestionLinkInvalidReason | null {
  if (question.sensitivity === "special_category") return "special_category";
  if (!field) return "field_not_found";
  if (!field.isActive) return "field_inactive";
  if (field.stage === "admin_only") return "admin_only";
  if (question.type && question.type !== field.type) return "type_mismatch";
  return null;
}
