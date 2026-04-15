import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  normalizeFieldInputValue,
  type MemberCustomFieldAnswersInput,
} from "@/lib/member-custom-fields";
import {
  memberCustomFieldValues,
  type MemberCustomField,
} from "@/server/db/schema";

type DbLike = {
  select: typeof import("@/server/db").db.select;
  insert: typeof import("@/server/db").db.insert;
  update: typeof import("@/server/db").db.update;
};

export async function validateMemberCustomFieldAnswers(
  fields: MemberCustomField[],
  answers: MemberCustomFieldAnswersInput,
) {
  const errors: Record<string, string[]> = {};
  const normalized = new Map<
    string,
    ReturnType<typeof normalizeFieldInputValue>["normalized"]
  >();

  for (const field of fields) {
    const result = normalizeFieldInputValue(field, answers[field.key]);

    if (result.error) {
      errors[field.key] = [result.error];
      continue;
    }

    normalized.set(field.id, result.normalized);
  }

  return {
    errors,
    normalized,
  };
}

export async function upsertMemberCustomFieldAnswers(
  database: DbLike,
  params: {
    orgId: string;
    memberId: string;
    fields: MemberCustomField[];
    answers: MemberCustomFieldAnswersInput;
  },
) {
  const validation = await validateMemberCustomFieldAnswers(
    params.fields,
    params.answers,
  );

  if (Object.keys(validation.errors).length > 0) {
    return validation;
  }

  const existingRows = await database
    .select({
      id: memberCustomFieldValues.id,
      fieldId: memberCustomFieldValues.fieldId,
    })
    .from(memberCustomFieldValues)
    .where(
      and(
        eq(memberCustomFieldValues.orgId, params.orgId),
        eq(memberCustomFieldValues.memberId, params.memberId),
      ),
    );

  const existingRowByFieldId = new Map(
    existingRows.map((row) => [row.fieldId, row.id]),
  );

  for (const field of params.fields) {
    const normalized = validation.normalized.get(field.id);

    if (!normalized) {
      continue;
    }

    const existingRowId = existingRowByFieldId.get(field.id);

    if (existingRowId) {
      await database
        .update(memberCustomFieldValues)
        .set({
          ...normalized,
          updatedAt: new Date(),
        })
        .where(eq(memberCustomFieldValues.id, existingRowId));
      continue;
    }

    await database.insert(memberCustomFieldValues).values({
      id: randomUUID(),
      orgId: params.orgId,
      memberId: params.memberId,
      fieldId: field.id,
      ...normalized,
    });
  }

  return validation;
}
