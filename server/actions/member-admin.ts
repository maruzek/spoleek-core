"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

import { createMemberSchema, updateMemberSchema } from "@/lib/member-admin";
import { orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { tenantMembers } from "@/server/db/schema";
import { upsertMemberCustomFieldAnswers } from "@/server/lib/member-custom-field-values";
import { requireOrganization } from "@/server/queries/access";
import { listMemberCustomFields } from "@/server/queries/member-custom-fields";
import {
  findUserByEmail,
  getMemberById,
  getMemberByUserId,
} from "@/server/queries/members";

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export const createShadowMemberAction = orgAdminActionClient
  .metadata({ actionName: "createShadowMember" })
  .inputSchema(createMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await requireOrganization();
    const email = normalizeEmail(parsedInput.email);
    const matchedUser = email ? await findUserByEmail(email) : null;

    if (matchedUser) {
      const existingMember = await getMemberByUserId(organization.id, matchedUser.id);

      if (existingMember) {
        returnValidationErrors(createMemberSchema, {
          email: {
            _errors: ["That user is already linked to a member record."],
          },
        });
      }
    }

    await db.insert(tenantMembers).values({
      id: randomUUID(),
      orgId: organization.id,
      userId: matchedUser?.id ?? null,
      email,
      firstName: parsedInput.firstName.trim(),
      lastName: parsedInput.lastName.trim(),
      role: parsedInput.role,
      status: parsedInput.status,
      linkedAt: matchedUser ? new Date() : null,
      acceptedTermsAt: matchedUser ? new Date() : null,
      acceptedPrivacyAt: matchedUser ? new Date() : null,
    });

    return {
      success: true,
      createdBy: ctx.auth.user.email,
    };
  });

export const approveMemberAction = orgAdminActionClient
  .metadata({ actionName: "approveMember" })
  .inputSchema(
    z.object({
      memberId: z.string().uuid(),
      role: z.enum(["member", "leader", "org_admin"]).default("member"),
    }),
  )
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();

    await db
      .update(tenantMembers)
      .set({
        role: parsedInput.role,
        status: "active",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantMembers.id, parsedInput.memberId),
          eq(tenantMembers.orgId, organization.id),
        ),
      );

    return { success: true };
  });

export const updateMemberAction = orgAdminActionClient
  .metadata({ actionName: "updateMember" })
  .inputSchema(updateMemberSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();
    const member = await getMemberById(organization.id, parsedInput.memberId);

    if (!member) {
      throw new Error("The selected member could not be found.");
    }

    const email = normalizeEmail(parsedInput.email);
    const matchedUser = email ? await findUserByEmail(email) : null;

    if (matchedUser && matchedUser.id !== member.userId) {
      const existingLinkedMember = await getMemberByUserId(organization.id, matchedUser.id);

      if (existingLinkedMember && existingLinkedMember.id !== member.id) {
        returnValidationErrors(updateMemberSchema, {
          email: {
            _errors: ["That user is already linked to another member record."],
          },
        });
      }
    }

    const customFields = await listMemberCustomFields(organization.id);

    const result = await db.transaction(async (tx) => {
      await tx
        .update(tenantMembers)
        .set({
          firstName: parsedInput.firstName.trim(),
          lastName: parsedInput.lastName.trim(),
          email,
          role: parsedInput.role,
          status: parsedInput.status,
          userId: member.userId ?? matchedUser?.id ?? null,
          linkedAt:
            member.linkedAt ??
            (member.userId == null && matchedUser ? new Date() : null),
          acceptedTermsAt:
            member.acceptedTermsAt ??
            (member.userId == null && matchedUser ? new Date() : null),
          acceptedPrivacyAt:
            member.acceptedPrivacyAt ??
            (member.userId == null && matchedUser ? new Date() : null),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tenantMembers.id, parsedInput.memberId),
            eq(tenantMembers.orgId, organization.id),
          ),
        );

      const answerResult = await upsertMemberCustomFieldAnswers(tx, {
        orgId: organization.id,
        memberId: parsedInput.memberId,
        fields: customFields,
        answers: parsedInput.customFieldAnswers,
      });

      if (Object.keys(answerResult.errors).length > 0) {
        return {
          success: false as const,
          customFieldErrors: answerResult.errors,
        };
      }

      return {
        success: true as const,
        customFieldErrors: {} as Record<string, string[]>,
      };
    });

    return result;
  });
