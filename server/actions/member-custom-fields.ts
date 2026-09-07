"use server";

import { and, eq, ne } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";

import { pickConstraintsForType } from "@/lib/member-custom-field-constraints";
import {
  memberCustomFieldActiveSchema,
  memberCustomFieldSchema,
} from "@/lib/member-custom-fields";
import { orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { memberCustomFields } from "@/server/db/schema";
import {
  fieldHasStoredAnswers,
  getMemberCustomFieldById,
  getMemberCustomFieldByKey,
  isCompatibleFieldTypeChange,
} from "@/server/queries/member-custom-fields";
import { requireOrgAdminAccess } from "@/server/queries/access";

/**
 * At most one field per organization holds the date of birth, enforced by a
 * partial unique index. Marking a new one moves the flag rather than failing on
 * that constraint — the admin's intent is "this field is the birth date now",
 * and a raw index violation would say nothing useful about how to fix it.
 */
async function clearOtherDateOfBirthFields(
  tx: Pick<typeof db, "update">,
  {
    orgId,
    isDateOfBirth,
    exceptFieldId,
  }: { orgId: string; isDateOfBirth: boolean; exceptFieldId?: string },
) {
  if (!isDateOfBirth) {
    return;
  }

  await tx
    .update(memberCustomFields)
    .set({ isDateOfBirth: false, updatedAt: new Date() })
    .where(
      and(
        eq(memberCustomFields.orgId, orgId),
        eq(memberCustomFields.isDateOfBirth, true),
        exceptFieldId ? ne(memberCustomFields.id, exceptFieldId) : undefined,
      ),
    );
}

export const saveMemberCustomFieldAction = orgAdminActionClient
  .metadata({ actionName: "saveMemberCustomField" })
  .inputSchema(memberCustomFieldSchema)
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    const duplicate = await getMemberCustomFieldByKey(organization.id, parsedInput.key);

    if (duplicate && duplicate.id !== parsedInput.id) {
      returnValidationErrors(memberCustomFieldSchema, {
        key: {
          _errors: ["That field key is already in use for this organization."],
        },
      });
    }

    const payload = {
      orgId: organization.id,
      key: parsedInput.key,
      label: parsedInput.label,
      description: parsedInput.description?.trim() || null,
      type: parsedInput.type,
      stage: parsedInput.stage,
      discoveryMode: parsedInput.discoveryMode,
      required: parsedInput.required,
      isActive: parsedInput.isActive,
      isDateOfBirth: parsedInput.isDateOfBirth,
      sortOrder: parsedInput.sortOrder,
      options: parsedInput.options,
      // Drop constraints that belong to a previously selected type.
      constraints: pickConstraintsForType(
        parsedInput.type,
        parsedInput.constraints,
      ),
      updatedAt: new Date(),
    };

    if (parsedInput.id) {
      const existing = await getMemberCustomFieldById(organization.id, parsedInput.id);

      if (!existing) {
        throw new Error("The custom field no longer exists.");
      }

      if (existing.type !== parsedInput.type) {
        const hasAnswers = await fieldHasStoredAnswers(organization.id, existing.id);

        if (hasAnswers && !isCompatibleFieldTypeChange(existing.type, parsedInput.type)) {
          returnValidationErrors(memberCustomFieldSchema, {
            type: {
              _errors: [
                "This field already has answers, so that type change is not allowed.",
              ],
            },
          });
        }
      }

      await db.transaction(async (tx) => {
        await clearOtherDateOfBirthFields(tx, {
          orgId: organization.id,
          isDateOfBirth: payload.isDateOfBirth,
          exceptFieldId: parsedInput.id!,
        });

        await tx
          .update(memberCustomFields)
          .set(payload)
          .where(
            and(
              eq(memberCustomFields.orgId, organization.id),
              eq(memberCustomFields.id, parsedInput.id!),
            ),
          );
      });

      return {
        success: true,
        fieldId: parsedInput.id,
      };
    }

    const [inserted] = await db.transaction(async (tx) => {
      await clearOtherDateOfBirthFields(tx, {
        orgId: organization.id,
        isDateOfBirth: payload.isDateOfBirth,
      });

      return tx
        .insert(memberCustomFields)
        .values(payload)
        .returning({ id: memberCustomFields.id });
    });

    return {
      success: true,
      fieldId: inserted!.id,
    };
  });

export const setMemberCustomFieldActiveAction = orgAdminActionClient
  .metadata({ actionName: "setMemberCustomFieldActive" })
  .inputSchema(memberCustomFieldActiveSchema)
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    if (!parsedInput.id) {
      throw new Error("Field id is required.");
    }

    await db
      .update(memberCustomFields)
      .set({
        isActive: parsedInput.isActive,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memberCustomFields.orgId, organization.id),
          eq(memberCustomFields.id, parsedInput.id),
        ),
      );

    return {
      success: true,
    };
  });
