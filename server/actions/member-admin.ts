"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

import {
  bulkDeleteMembersSchema,
  createMemberSchema,
  deleteMemberSchema,
  resendMemberInviteSchema,
  updateMemberSchema,
} from "@/lib/member-admin";
import { orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { tenantMembers } from "@/server/db/schema";
import { logMemberAuthEvent, sendMemberActivationInvite } from "@/server/lib/member-invites";
import { softDeleteMembers } from "@/server/lib/member-lifecycle";
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

function usesEmailPasswordActivation(authStrategy: string | null) {
  return authStrategy === "email-password" || authStrategy === "email-password-google";
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
  .action(async ({ parsedInput, ctx }) => {
    const organization = await requireOrganization();
    const nextStatus = usesEmailPasswordActivation(organization.setupAuthStrategy)
      ? "invited"
      : "active";

    await db
      .update(tenantMembers)
      .set({
        role: parsedInput.role,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantMembers.id, parsedInput.memberId),
          eq(tenantMembers.orgId, organization.id),
        ),
      );

    await logMemberAuthEvent({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      actorUserId: ctx.auth.user.id,
      eventType: "member_approved",
      metadata: {
        role: parsedInput.role,
        status: nextStatus,
      },
    });

    let inviteResult: Awaited<ReturnType<typeof sendMemberActivationInvite>> | null = null;

    if (usesEmailPasswordActivation(organization.setupAuthStrategy)) {
      inviteResult = await sendMemberActivationInvite({
        memberId: parsedInput.memberId,
        actorUserId: ctx.auth.user.id,
      });
    }

    return {
      success: true,
      inviteSent: inviteResult?.sent ?? false,
      inviteReason: inviteResult?.reason ?? null,
    };
  });

export const resendMemberInviteAction = orgAdminActionClient
  .metadata({ actionName: "resendMemberInvite" })
  .inputSchema(resendMemberInviteSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await requireOrganization();

    if (!usesEmailPasswordActivation(organization.setupAuthStrategy)) {
      throw new Error("Member activation emails are only available for email/password sign-in.");
    }

    const result = await sendMemberActivationInvite({
      memberId: parsedInput.memberId,
      force: true,
      actorUserId: ctx.auth.user.id,
    });

    return {
      success: true,
      sent: result.sent,
      reason: result.reason,
    };
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

export const deleteMemberAction = orgAdminActionClient
  .metadata({ actionName: "deleteMember" })
  .inputSchema(deleteMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await requireOrganization();

    return softDeleteMembers({
      actorUserId: ctx.auth.user.id,
      memberIds: [parsedInput.memberId],
      orgId: organization.id,
    });
  });

export const bulkDeleteMembersAction = orgAdminActionClient
  .metadata({ actionName: "bulkDeleteMembers" })
  .inputSchema(bulkDeleteMembersSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await requireOrganization();

    return softDeleteMembers({
      actorUserId: ctx.auth.user.id,
      memberIds: parsedInput.memberIds,
      orgId: organization.id,
    });
  });
