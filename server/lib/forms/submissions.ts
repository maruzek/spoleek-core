import { and, eq, sql } from "drizzle-orm";

import { canSubmit, type FormViewer, type RuleEvent } from "@/lib/forms/rules";
import { resolveProfileWrites } from "@/lib/forms/profile-sync";
import { validateSubmission } from "@/lib/forms/validation";
import { type Dictionary, messages } from "@/lib/i18n/messages";
import { db } from "@/server/db";
import {
  formAnswers,
  formSubmissions,
  type EventRsvpAnswer,
  type Form,
  type FormQuestion,
  type MemberCustomField,
} from "@/server/db/schema";
import { sealAnswer } from "@/server/lib/forms/answers";
import { upsertMemberCustomFieldAnswers } from "@/server/lib/member-custom-field-values";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Error codes surfaced to the UI as the thrown message, like `EventError`.
 * `INVALID_ANSWERS` carries the per-question messages the filler renders.
 */
export type FormErrorCode =
  | "FORM_CLOSED"
  | "NOT_ELIGIBLE"
  | "RSVP_REQUIRED"
  | "TOKEN_INVALID"
  | "RATE_LIMITED"
  | "INVALID_ANSWERS"
  | "QUESTION_LINK_INVALID"
  | "TEMPLATE_READ_ONLY"
  | "FORM_NOT_MANAGEABLE"
  | "NOT_FOUND";

export class FormError extends Error {
  constructor(
    public readonly code: FormErrorCode,
    public readonly details: Record<string, string> = {},
  ) {
    super(code);
    this.name = "FormError";
  }
}

/**
 * Who is submitting. A token holder may be a member (shadow or not yet
 * activated) or an external; the row is keyed on whichever the token names.
 * `rsvpAnswer` is the identity's own RSVP on the linked event, loaded by the
 * caller; `eligible` is the member's audience check.
 */
export type SubmissionIdentity =
  | { kind: "member"; memberId: string; eligible: boolean; rsvpAnswer: EventRsvpAnswer | null }
  | {
      kind: "token";
      memberId: string | null;
      guestEmail: string | null;
      guestName: string | null;
      rsvpAnswer: EventRsvpAnswer | null;
    }
  | { kind: "guest"; guestEmail: string; guestName: string; rsvpAnswer: EventRsvpAnswer | null };

export function viewerOf(identity: SubmissionIdentity): FormViewer {
  switch (identity.kind) {
    case "member":
      return { kind: "member", eligible: identity.eligible, rsvpAnswer: identity.rsvpAnswer };
    case "token":
      return { kind: "token", rsvpAnswer: identity.rsvpAnswer };
    case "guest":
      return { kind: "guest", rsvpAnswer: identity.rsvpAnswer };
  }
}

/**
 * The one write path for every submission (portal, token, public guest,
 * manager proxy).
 *
 * Validate → upsert the submission row (one per member, one per lower-cased
 * guest email) → replace its answers, sealing special-category ones → write
 * the profile values the member asked for. All inside the caller's
 * transaction, so a failed profile write rolls the submission back rather
 * than leaving an answer that claims to have been saved to the profile.
 *
 * `skipRules` is for a manager submitting on someone's behalf: a late paper
 * form typed in after the deadline is exactly the case, and the guard on the
 * action already proved they may manage the form.
 */
export async function persistSubmission(
  tx: Tx,
  params: {
    form: Pick<Form, "id" | "orgId" | "status" | "closesAt" | "onlyRsvpYes" | "eventId">;
    event: RuleEvent | null;
    questions: readonly FormQuestion[];
    /** Live custom fields for every linked question that still has one. */
    liveFieldsById: ReadonlyMap<string, MemberCustomField>;
    identity: SubmissionIdentity;
    answers: Record<string, unknown>;
    syncFlags?: Record<string, boolean>;
    /** The manager typing on someone's behalf; null when the person did it. */
    submittedByUserId: string | null;
    skipRules?: boolean;
    now?: Date;
    dict?: Dictionary;
  },
) {
  const {
    form,
    event,
    questions,
    liveFieldsById,
    identity,
    answers,
    syncFlags = {},
    submittedByUserId,
    skipRules = false,
    now = new Date(),
    dict = messages.en,
  } = params;

  if (!skipRules) {
    const allowed = canSubmit({ form, event, viewer: viewerOf(identity), now });
    if (!allowed.ok) throw new FormError(allowed.reason);
  }

  const validation = validateSubmission({ questions, liveFieldsById, answers, dict });
  if (!validation.ok) throw new FormError("INVALID_ANSWERS", validation.errors);

  const memberId = identity.kind === "guest" ? null : identity.memberId;
  const guestEmail =
    identity.kind === "member" ? null : identity.guestEmail?.trim().toLowerCase() ?? null;
  const guestName = identity.kind === "member" ? null : identity.guestName ?? null;

  if (!memberId && !guestEmail) throw new FormError("NOT_ELIGIBLE");

  const [existing] = await tx
    .select({ id: formSubmissions.id })
    .from(formSubmissions)
    .where(
      and(
        eq(formSubmissions.formId, form.id),
        memberId
          ? eq(formSubmissions.memberId, memberId)
          : sql`lower(${formSubmissions.guestEmail}) = ${guestEmail}`,
      ),
    )
    .limit(1);

  let submissionId: string;
  if (existing) {
    submissionId = existing.id;
    await tx
      .update(formSubmissions)
      .set({
        guestName: memberId ? null : guestName,
        submittedByUserId,
        // An edit un-shreds nothing, but the row is live again.
        shreddedAt: null,
      })
      .where(eq(formSubmissions.id, submissionId));
  } else {
    const [inserted] = await tx
      .insert(formSubmissions)
      .values({
        orgId: form.orgId,
        formId: form.id,
        memberId,
        guestEmail,
        guestName: memberId ? null : guestName,
        submittedAt: now,
        submittedByUserId,
      })
      .returning({ id: formSubmissions.id });
    submissionId = inserted!.id;
  }

  await tx.delete(formAnswers).where(eq(formAnswers.submissionId, submissionId));

  const questionById = new Map(questions.map((q) => [q.id, q]));
  const rows = [...validation.values]
    .filter(([, value]) => value !== null)
    .map(([questionId, value]) => ({
      orgId: form.orgId,
      submissionId,
      questionId,
      ...sealAnswer(questionById.get(questionId)!, value),
    }));

  if (rows.length > 0) {
    await tx.insert(formAnswers).values(rows);
  }

  const writes = resolveProfileWrites({
    questions,
    values: validation.values,
    syncFlags,
    identityKind: identity.kind,
  });

  if (writes.length > 0 && memberId) {
    const fields: MemberCustomField[] = [];
    const profileAnswers: Record<string, unknown> = {};
    for (const write of writes) {
      const field = liveFieldsById.get(write.fieldId);
      if (!field) continue;
      fields.push(field);
      profileAnswers[field.key] = write.value;
    }

    const result = await upsertMemberCustomFieldAnswers(tx, {
      orgId: form.orgId,
      memberId,
      fields,
      answers: profileAnswers,
      dict,
    });

    if (Object.keys(result.errors).length > 0) {
      // Map the field key back to the question so the filler can point at it.
      const byFieldKey = new Map(
        questions
          .filter((q) => q.memberFieldId)
          .map((q) => [liveFieldsById.get(q.memberFieldId!)?.key, q.id] as const),
      );
      const details: Record<string, string> = {};
      for (const [key, errs] of Object.entries(result.errors)) {
        const questionId = byFieldKey.get(key);
        if (questionId) details[questionId] = errs[0] ?? "";
      }
      throw new FormError("INVALID_ANSWERS", details);
    }
  }

  return { submissionId, values: validation.values, profileWrites: writes.length };
}
