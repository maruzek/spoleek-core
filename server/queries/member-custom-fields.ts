import { and, asc, eq, inArray } from "drizzle-orm";

import { extractAnswerValue } from "@/lib/member-custom-fields";
import { db } from "@/server/db";
import {
  memberCustomFields,
  memberCustomFieldValues,
  type MemberCustomFieldStage,
  type MemberCustomFieldType,
} from "@/server/db/schema";

export type MemberCustomFieldDefinition = typeof memberCustomFields.$inferSelect;

export async function listMemberCustomFields(orgId: string) {
  return db
    .select()
    .from(memberCustomFields)
    .where(eq(memberCustomFields.orgId, orgId))
    .orderBy(
      asc(memberCustomFields.sortOrder),
      asc(memberCustomFields.label),
      asc(memberCustomFields.createdAt),
    );
}

export async function getMemberCustomFieldById(orgId: string, fieldId: string) {
  const [field] = await db
    .select()
    .from(memberCustomFields)
    .where(
      and(eq(memberCustomFields.orgId, orgId), eq(memberCustomFields.id, fieldId)),
    )
    .limit(1);

  return field ?? null;
}

export async function getMemberCustomFieldByKey(orgId: string, key: string) {
  const [field] = await db
    .select()
    .from(memberCustomFields)
    .where(and(eq(memberCustomFields.orgId, orgId), eq(memberCustomFields.key, key)))
    .limit(1);

  return field ?? null;
}

export async function listActiveMemberCustomFields(
  orgId: string,
  stages?: MemberCustomFieldStage[],
)
{
  const filters = [
    eq(memberCustomFields.orgId, orgId),
    eq(memberCustomFields.isActive, true),
  ];

  if (stages && stages.length > 0) {
    filters.push(inArray(memberCustomFields.stage, stages));
  }

  return db
    .select()
    .from(memberCustomFields)
    .where(and(...filters))
    .orderBy(
      asc(memberCustomFields.sortOrder),
      asc(memberCustomFields.label),
      asc(memberCustomFields.createdAt),
    );
}

export async function getMemberCustomFieldAnswerRows(orgId: string, memberId: string) {
  return db
    .select({
      id: memberCustomFieldValues.id,
      fieldId: memberCustomFieldValues.fieldId,
      value: memberCustomFieldValues.value,
      updatedAt: memberCustomFieldValues.updatedAt,
    })
    .from(memberCustomFieldValues)
    .where(
      and(
        eq(memberCustomFieldValues.orgId, orgId),
        eq(memberCustomFieldValues.memberId, memberId),
      ),
    );
}

export async function getMemberCustomFieldAnswerMap(orgId: string, memberId: string) {
  const [fields, rows] = await Promise.all([
    listMemberCustomFields(orgId),
    getMemberCustomFieldAnswerRows(orgId, memberId),
  ]);

  const rowByFieldId = new Map(rows.map((row) => [row.fieldId, row]));

  return Object.fromEntries(
    fields.map((field) => {
      const row = rowByFieldId.get(field.id);
      const value = row == null ? null : extractAnswerValue(row.value);
      return [field.key, value];
    }),
  );
}

export async function fieldHasStoredAnswers(orgId: string, fieldId: string) {
  const [row] = await db
    .select({ id: memberCustomFieldValues.id })
    .from(memberCustomFieldValues)
    .where(
      and(
        eq(memberCustomFieldValues.orgId, orgId),
        eq(memberCustomFieldValues.fieldId, fieldId),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export function isCompatibleFieldTypeChange(
  previousType: MemberCustomFieldType,
  nextType: MemberCustomFieldType,
) {
  if (previousType === nextType) {
    return true;
  }

  const textFamily: MemberCustomFieldType[] = [
    "text",
    "textarea",
    "email",
    "phone",
    "select",
  ];

  if (textFamily.includes(previousType) && textFamily.includes(nextType)) {
    return true;
  }

  return false;
}

export async function getPostApprovalCompleteness(orgId: string, memberId: string) {
  const [fields, answers] = await Promise.all([
    listActiveMemberCustomFields(orgId, ["post_approval"]),
    getMemberCustomFieldAnswerMap(orgId, memberId),
  ]);

  const missingRequiredFields = fields.filter((field) => {
    if (!field.required) {
      return false;
    }

    const value = answers[field.key];

    if (field.type === "boolean") {
      return value !== true;
    }

    if (Array.isArray(value)) {
      return value.length === 0;
    }

    return value == null || String(value).trim().length === 0;
  });

  return {
    isComplete: missingRequiredFields.length === 0,
    missingRequiredFields,
  };
}
