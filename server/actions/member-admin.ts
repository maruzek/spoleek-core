"use server";

import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

import {
  bulkDeleteMembersSchema,
  createMemberSchema,
  deleteMemberSchema,
  resendMemberInviteSchema,
  updateMemberSchema,
} from "@/lib/member-admin";
import { authActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { groupMemberships, tenantMembers } from "@/server/db/schema";
import {
  canAccessMemberInScope,
  resolveMemberManagementScope,
  validateManagedGroupSelection,
} from "@/server/lib/member-management-scope";
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

function resolveAllowedRole(
  requestedRole: "member" | "leader" | "org_admin",
  canAssignElevatedRoles: boolean,
) {
  return canAssignElevatedRoles ? requestedRole : "member";
}

function validateGroupSelectionOrThrow(args: {
  schema: typeof createMemberSchema | typeof updateMemberSchema;
  scopeAccessLevel: "full" | "scoped";
  manageableGroupCategories: Awaited<ReturnType<typeof resolveMemberManagementScope>>["manageableGroupCategories"];
  groupIds: string[];
  requireAtLeastOneGroup: boolean;
}) {
  const uniqueGroupIds = [...new Set(args.groupIds)];
  const selectionError = validateManagedGroupSelection(
    args.manageableGroupCategories,
    uniqueGroupIds,
  );

  if (selectionError) {
    returnValidationErrors(args.schema, {
      groupIds: {
        _errors: [selectionError],
      },
    });
  }

  if (
    args.scopeAccessLevel === "scoped" &&
    args.requireAtLeastOneGroup &&
    uniqueGroupIds.length === 0
  ) {
    returnValidationErrors(args.schema, {
      groupIds: {
        _errors: ["Assign at least one managed group."],
      },
    });
  }

  return uniqueGroupIds;
}

async function assertMemberInScopeOrThrow(args: {
  memberId: string;
  orgId: string;
  scope: Awaited<ReturnType<typeof resolveMemberManagementScope>>;
}) {
  const member = await getMemberById(args.orgId, args.memberId);

  if (!member) {
    throw new Error("The selected member could not be found.");
  }

  const inScope = await canAccessMemberInScope(args.orgId, args.memberId, args.scope);

  if (!inScope) {
    throw new Error("You can only manage members in your delegated scope.");
  }

  return member;
}

async function syncManageableGroupMemberships(args: {
  memberId: string;
  orgId: string;
  allowedGroupIds: string[];
  nextGroupIds: string[];
  tx: Pick<typeof db, "select" | "insert" | "delete">;
}) {
  const uniqueAllowedGroupIds = [...new Set(args.allowedGroupIds)];
  const uniqueNextGroupIds = [...new Set(args.nextGroupIds)];

  if (uniqueAllowedGroupIds.length === 0) {
    return;
  }

  const existingMemberships = await args.tx
    .select({
      id: groupMemberships.id,
      groupId: groupMemberships.groupId,
    })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, args.orgId),
        eq(groupMemberships.memberId, args.memberId),
        inArray(groupMemberships.groupId, uniqueAllowedGroupIds),
      ),
    );

  const existingGroupIds = new Set(existingMemberships.map((membership) => membership.groupId));
  const nextGroupIdsSet = new Set(uniqueNextGroupIds);

  const membershipIdsToDelete = existingMemberships
    .filter((membership) => !nextGroupIdsSet.has(membership.groupId))
    .map((membership) => membership.id);

  if (membershipIdsToDelete.length > 0) {
    await args.tx
      .delete(groupMemberships)
      .where(
        and(
          eq(groupMemberships.orgId, args.orgId),
          inArray(groupMemberships.id, membershipIdsToDelete),
        ),
      );
  }

  const groupIdsToInsert = uniqueNextGroupIds.filter((groupId) => !existingGroupIds.has(groupId));

  if (groupIdsToInsert.length > 0) {
    await args.tx
      .insert(groupMemberships)
      .values(
        groupIdsToInsert.map((groupId) => ({
          id: randomUUID(),
          orgId: args.orgId,
          groupId,
          memberId: args.memberId,
          role: "member" as const,
        })),
      )
      .onConflictDoNothing();
  }
}

export const createShadowMemberAction = authActionClient
  .metadata({ actionName: "createShadowMember" })
  .inputSchema(createMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(),
    ]);
    const groupIds = validateGroupSelectionOrThrow({
      schema: createMemberSchema,
      scopeAccessLevel: scope.accessLevel,
      manageableGroupCategories: scope.manageableGroupCategories,
      groupIds: parsedInput.groupIds,
      requireAtLeastOneGroup: true,
    });
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

    const memberId = randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(tenantMembers).values({
        id: memberId,
        orgId: organization.id,
        userId: matchedUser?.id ?? null,
        email,
        firstName: parsedInput.firstName.trim(),
        lastName: parsedInput.lastName.trim(),
        role: resolveAllowedRole(parsedInput.role, scope.canAssignElevatedRoles),
        status: parsedInput.status,
        linkedAt: matchedUser ? new Date() : null,
        acceptedTermsAt: matchedUser ? new Date() : null,
        acceptedPrivacyAt: matchedUser ? new Date() : null,
      });

      await syncManageableGroupMemberships({
        tx,
        orgId: organization.id,
        memberId,
        allowedGroupIds: scope.manageableGroupCategories.flatMap((category) =>
          category.groups.map((group) => group.id),
        ),
        nextGroupIds: groupIds,
      });
    });

    return {
      success: true,
      createdBy: ctx.auth.user.email,
    };
  });

export const approveMemberAction = authActionClient
  .metadata({ actionName: "approveMember" })
  .inputSchema(
    z.object({
      memberId: z.string().uuid(),
      role: z.enum(["member", "leader", "org_admin"]).default("member"),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(),
    ]);
    await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });
    const nextStatus = usesEmailPasswordActivation(organization.setupAuthStrategy)
      ? "invited"
      : "active";
    const nextRole = resolveAllowedRole(parsedInput.role, scope.canAssignElevatedRoles);

    await db
      .update(tenantMembers)
      .set({
        role: nextRole,
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
        role: nextRole,
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

export const resendMemberInviteAction = authActionClient
  .metadata({ actionName: "resendMemberInvite" })
  .inputSchema(resendMemberInviteSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(),
    ]);

    await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });

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

export const updateMemberAction = authActionClient
  .metadata({ actionName: "updateMember" })
  .inputSchema(updateMemberSchema)
  .action(async ({ parsedInput }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(),
    ]);
    const member = await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });
    const groupIds = validateGroupSelectionOrThrow({
      schema: updateMemberSchema,
      scopeAccessLevel: scope.accessLevel,
      manageableGroupCategories: scope.manageableGroupCategories,
      groupIds: parsedInput.groupIds,
      requireAtLeastOneGroup: false,
    });
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
          role: resolveAllowedRole(parsedInput.role, scope.canAssignElevatedRoles),
          status: parsedInput.status,
          userId: member.userId ?? matchedUser?.id ?? null,
          linkedAt: member.linkedAt ?? (member.userId == null && matchedUser ? new Date() : null),
          acceptedTermsAt:
            member.acceptedTermsAt ?? (member.userId == null && matchedUser ? new Date() : null),
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

      await syncManageableGroupMemberships({
        tx,
        orgId: organization.id,
        memberId: parsedInput.memberId,
        allowedGroupIds: scope.manageableGroupCategories.flatMap((category) =>
          category.groups.map((group) => group.id),
        ),
        nextGroupIds: groupIds,
      });

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

export const deleteMemberAction = authActionClient
  .metadata({ actionName: "deleteMember" })
  .inputSchema(deleteMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(),
    ]);

    await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });

    return softDeleteMembers({
      actorUserId: ctx.auth.user.id,
      memberIds: [parsedInput.memberId],
      orgId: organization.id,
    });
  });

export const bulkDeleteMembersAction = authActionClient
  .metadata({ actionName: "bulkDeleteMembers" })
  .inputSchema(bulkDeleteMembersSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(),
    ]);

    for (const memberId of parsedInput.memberIds) {
      await assertMemberInScopeOrThrow({
        orgId: organization.id,
        memberId,
        scope,
      });
    }

    return softDeleteMembers({
      actorUserId: ctx.auth.user.id,
      memberIds: parsedInput.memberIds,
      orgId: organization.id,
    });
  });
