"use server";

import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { WorkspaceWelcomeEmail } from "@/emails/workspace-welcome-email";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

import {
  approveMemberSchema,
  batchLookupWorkspaceUsersSchema,
  batchSuggestWorkspaceEmailsSchema,
  bulkDeleteMembersSchema,
  createMemberSchema,
  createWorkspaceAccountSchema,
  deleteMemberSchema,
  restoreMemberSchema,
  importMembersSchema,
  provisionMemberWorkspaceAccountSchema,
  resendMemberInviteSchema,
  searchWorkspaceUsersSchema,
  updateMemberSchema,
  rejectMemberSchema,
} from "@/lib/member-admin";
import {
  describeApprovalRequirement,
  requiresApprovalFlow,
} from "@/lib/member-status-transitions";
import {
  isWorkspaceModuleReady,
  usesEmailPasswordActivation,
} from "@/lib/members/approval";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { generateRandomPassword } from "@/lib/crypto";
import { getDictionary } from "@/lib/i18n";
import { authActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { groupCategories, groupMemberships, organizations, tenantMembers } from "@/server/db/schema";
import {
  canAccessMemberInScope,
  resolveMemberManagementScope,
} from "@/server/lib/member-management-scope";
import {
  logMemberAuthEvent,
  sendMemberActivationInvite,
} from "@/server/lib/member-invites";
import {
  approveMember,
  hardDeleteMembers,
  restoreMembers,
  softDeleteMembers,
} from "@/server/lib/member-lifecycle";
import { notifyMembershipDeleted } from "@/server/notifications/membership";
import { sendEmail } from "@/server/notifications/send";
import { partitionFieldsByVisibility } from "@/server/lib/member-field-visibility";
import { notifyRegistrationRejected } from "@/server/notifications/registration";
import {
  upsertMemberCustomFieldAnswers,
  validateMemberCustomFieldAnswers,
} from "@/server/lib/member-custom-field-values";
import {
  WorkspaceApiError,
  WorkspaceNotConnectedError,
  checkWorkspaceUserExists,
  createWorkspaceUser,
  getWorkspaceUser,
  searchWorkspaceUsers,
} from "@/server/lib/workspace/client";

import {
  DEFAULT_WORKSPACE_EMAIL_TEMPLATE,
  buildWorkspaceEmail,
} from "@/server/lib/workspace/email-template";
import { provisionWorkspaceAccountForMember } from "@/server/lib/workspace/provision";
import { resolveProvisionFieldsForMember } from "@/server/lib/workspace/resolve-provision-fields";
import { requireOrganization } from "@/server/queries/access";
import { listMemberCustomFields } from "@/server/queries/member-custom-fields";
import {
  findUserByEmail,
  getMemberById,
  getMemberByUserId,
} from "@/server/queries/members";
import {
  activeMembership,
  GroupMembershipError,
  syncManageableGroupMemberships,
} from "@/server/lib/group-membership";

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function resolveAllowedRole(
  requestedRole: "member" | "leader" | "org_admin",
  canAssignElevatedRoles: boolean,
) {
  return canAssignElevatedRoles ? requestedRole : "member";
}

/**
 * The RBAC half of group assignment: a scoped leader may only hand out groups
 * they manage. The selection-count invariant is not checked here — the write
 * seam (`upsertActiveMembership`) owns it; see `groupIdsValidationError`.
 */
function requireGroupIdsInScopeOrThrow(args: {
  schema: typeof createMemberSchema | typeof updateMemberSchema;
  scopeAccessLevel: "full" | "scoped";
  manageableGroupCategories: Awaited<
    ReturnType<typeof resolveMemberManagementScope>
  >["manageableGroupCategories"];
  groupIds: string[];
  requireAtLeastOneGroup: boolean;
}) {
  const uniqueGroupIds = [...new Set(args.groupIds)];
  const allowedGroupIds = new Set(
    args.manageableGroupCategories.flatMap((category) =>
      category.groups.map((group) => group.id),
    ),
  );

  if (uniqueGroupIds.some((groupId) => !allowedGroupIds.has(groupId))) {
    returnValidationErrors(args.schema, {
      groupIds: {
        _errors: ["One or more selected groups are outside your management scope."],
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

/**
 * A selection the write seam refused becomes a field error on `groupIds`, so
 * the member form shows it next to the picker instead of as a toast. Anything
 * else is rethrown.
 */
function rethrowAsGroupIdsValidationError(
  schema: typeof createMemberSchema | typeof updateMemberSchema,
  error: unknown,
): never {
  if (error instanceof GroupMembershipError) {
    returnValidationErrors(schema, { groupIds: { _errors: [error.message] } });
  }
  throw error;
}

async function assertMemberInScopeOrThrow(args: {
  memberId: string;
  orgId: string;
  scope: Awaited<ReturnType<typeof resolveMemberManagementScope>>;
  /** Restore is the only caller that acts on a member who is already deleted. */
  includeDeleted?: boolean;
}) {
  const member = await getMemberById(args.orgId, args.memberId, {
    includeDeleted: args.includeDeleted,
  });

  if (!member) {
    throw new Error("The selected member could not be found.");
  }

  const inScope = await canAccessMemberInScope(
    args.orgId,
    args.memberId,
    args.scope,
  );

  if (!inScope) {
    throw new Error("You can only manage members in your delegated scope.");
  }

  return member;
}

export const createShadowMemberAction = authActionClient
  .metadata({ actionName: "createShadowMember" })
  .inputSchema(createMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);
    const groupIds = requireGroupIdsInScopeOrThrow({
      schema: createMemberSchema,
      scopeAccessLevel: scope.accessLevel,
      manageableGroupCategories: scope.manageableGroupCategories,
      groupIds: parsedInput.groupIds,
      requireAtLeastOneGroup: true,
    });
    const email = normalizeEmail(parsedInput.email);
    const matchedUser = email ? await findUserByEmail(email) : null;

    if (matchedUser) {
      const existingMember = await getMemberByUserId(
        organization.id,
        matchedUser.id,
      );

      if (existingMember) {
        returnValidationErrors(createMemberSchema, {
          email: {
            _errors: ["That user is already linked to a member record."],
          },
        });
      }
    }

    const customFields = await listMemberCustomFields(organization.id);
    /**
     * Only the fields the create form actually shows, and "required" enforced
     * exactly where the join form enforces it. Validating against every stored
     * field rejected the submission over inactive or post-approval answers the
     * admin was never offered — an error with no input to attach it to.
     */
    const creationFields = customFields
      .filter((field) => field.isActive)
      .map((field) =>
        field.stage === "registration" ? field : { ...field, required: false },
      );

    // Validated before the insert, not inside it: a bad answer should leave no
    // member row behind for the admin to clean up.
    const answerValidation = await validateMemberCustomFieldAnswers(
      creationFields,
      parsedInput.customFieldAnswers,
    );

    if (Object.keys(answerValidation.errors).length > 0) {
      return {
        success: false as const,
        customFieldErrors: answerValidation.errors,
        createdBy: ctx.auth.user.email,
      };
    }

    const firstName = parsedInput.firstName.trim();
    const lastName = parsedInput.lastName.trim();

    const memberId = await db.transaction(async (tx) => {
      const [{ id }] = await tx.insert(tenantMembers).values({
        orgId: organization.id,
        userId: matchedUser?.id ?? null,
        email,
        firstName,
        lastName,
        role: resolveAllowedRole(
          parsedInput.role,
          scope.canAssignElevatedRoles,
        ),
        status: parsedInput.status,
        linkedAt: matchedUser ? new Date() : null,
        // No consent is recorded here. Matching an existing user account means
        // the person has a login, not that they were shown anything — the two
        // used to be conflated. They are asked by the portal gate on their next
        // visit; see docs/legal-policies.md §5.
      }).returning({ id: tenantMembers.id });

      await syncManageableGroupMemberships({
        tx,
        orgId: organization.id,
        memberId: id,
        allowedGroupIds: scope.manageableGroupCategories.flatMap((category) =>
          category.groups.map((group) => group.id),
        ),
        nextGroupIds: groupIds,
      });

      await upsertMemberCustomFieldAnswers(tx, {
        orgId: organization.id,
        memberId: id,
        fields: creationFields,
        answers: parsedInput.customFieldAnswers,
      });

      return id;
    }).catch((error: unknown) =>
      rethrowAsGroupIdsValidationError(createMemberSchema, error),
    );

    // Workspace accounts are never created here. The member has to exist first
    // for the provisioning dialog to resolve its auto-filled fields, so the
    // caller re-opens that dialog with `memberId` when the admin asked for one.
    return {
      success: true as const,
      memberId,
      customFieldErrors: {} as Record<string, string[]>,
      createdBy: ctx.auth.user.email,
    };
  });

export const approveMemberAction = authActionClient
  .metadata({ actionName: "approveMember" })
  .inputSchema(approveMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const scope = await resolveMemberManagementScope(ctx.viewer);
    const member = await assertMemberInScopeOrThrow({
      orgId: ctx.viewer.organization.id,
      memberId: parsedInput.memberId,
      scope,
    });

    return approveMember(ctx.viewer, member, {
      role: resolveAllowedRole(parsedInput.role, scope.canAssignElevatedRoles),
      acknowledgeWorkspaceUnavailable: parsedInput.acknowledgeWorkspaceUnavailable,
      skipWorkspaceAccount: parsedInput.skipWorkspaceAccount,
      acknowledgeUnderAge: parsedInput.acknowledgeUnderAge,
      workspaceEmail: parsedInput.workspace?.primaryEmail ?? null,
      workspaceExtraFields: parsedInput.workspace?.extraFields,
    });
  });

export const checkWorkspaceEmailAvailabilityAction = authActionClient
  .metadata({ actionName: "checkWorkspaceEmailAvailability" })
  .inputSchema(
    z.object({
      memberId: z.string().uuid(),
      primaryEmail: z.string().email(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);
    await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });

    if (!isWorkspaceModuleReady(organization)) {
      return {
        status: "module_off" as const,
      };
    }

    try {
      const result = await checkWorkspaceUserExists(
        organization.id,
        parsedInput.primaryEmail.trim().toLowerCase(),
      );
      return result.exists
        ? {
            status: "taken" as const,
            existingFullName: result.fullName ?? null,
          }
        : { status: "available" as const };
    } catch (error) {
      if (error instanceof WorkspaceNotConnectedError) {
        return { status: "not_connected" as const };
      }
      if (error instanceof WorkspaceApiError) {
        return {
          status: "error" as const,
          message: error.message,
          reason: error.reason ?? null,
        };
      }
      return {
        status: "error" as const,
        message:
          error instanceof Error
            ? error.message
            : "Failed to reach Google Workspace.",
        reason: null,
      };
    }
  });

export const suggestWorkspaceEmailAction = authActionClient
  .metadata({ actionName: "suggestWorkspaceEmail" })
  .inputSchema(z.object({ memberId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);
    const member = await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });

    if (
      !isWorkspaceModuleReady(organization) ||
      !organization.workspaceDomain
    ) {
      return { suggestion: null as string | null };
    }

    const suggestion = buildWorkspaceEmail({
      template:
        organization.workspaceEmailTemplate || DEFAULT_WORKSPACE_EMAIL_TEMPLATE,
      firstName: member.firstName ?? "",
      lastName: member.lastName ?? "",
      domain: organization.workspaceDomain,
    });

    return { suggestion };
  });

export const syncWorkspaceMemberAction = authActionClient
  .metadata({ actionName: "syncWorkspaceMember" })
  .inputSchema(z.object({ memberId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);

    const member = await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });

    if (!isWorkspaceModuleReady(organization)) {
      throw new Error("Google Workspace is not properly configured.");
    }

    let targetEmail = member.workspaceUserEmail;
    let isImplicitFallback = false;

    if (!targetEmail && member.email && organization.workspaceDomain) {
      const personalEmail = member.email.trim().toLowerCase();
      const domain = organization.workspaceDomain.trim().toLowerCase();

      if (personalEmail.endsWith(`@${domain}`)) {
        targetEmail = member.email;
        isImplicitFallback = true;
      }
    }

    if (!targetEmail) {
      throw new Error(
        "This member does not have a Workspace email assigned or a matching personal email.",
      );
    }

    try {
      const workspaceUser = await getWorkspaceUser(
        organization.id,
        targetEmail.trim().toLowerCase(),
      );

      if (!workspaceUser) {
        throw new Error(`No Google Workspace account found for ${targetEmail}`);
      }

      const now = new Date();
      await db
        .update(tenantMembers)
        .set({
          workspaceUserId: workspaceUser.id,
          ...(isImplicitFallback
            ? {
                workspaceUserEmail: workspaceUser.primaryEmail,
                workspaceProvisionedAt: now,
              }
            : {}),
          updatedAt: now,
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
        eventType: "workspace_user_linked",
        metadata: {
          workspaceUserId: workspaceUser.id,
          workspaceUserEmail: workspaceUser.primaryEmail,
          isImplicitMatch: isImplicitFallback,
        },
      });

      return { success: true, workspaceUserId: workspaceUser.id };
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error("Failed to sync Workspace identity.");
    }
  });

export const resendMemberInviteAction = authActionClient
  .metadata({ actionName: "resendMemberInvite" })
  .inputSchema(resendMemberInviteSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);

    await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });

    if (!usesEmailPasswordActivation(organization.setupAuthStrategy)) {
      throw new Error(
        "Member activation emails are only available for email/password sign-in.",
      );
    }

    const result = await sendMemberActivationInvite({
      orgId: organization.id,
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
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);
    const member = await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });
    if (
      member.status !== "deleted" &&
      requiresApprovalFlow(member.status, parsedInput.status)
    ) {
      returnValidationErrors(updateMemberSchema, {
        status: {
          _errors: [describeApprovalRequirement(parsedInput.status)],
        },
      });
    }

    const groupIds = requireGroupIdsInScopeOrThrow({
      schema: updateMemberSchema,
      scopeAccessLevel: scope.accessLevel,
      manageableGroupCategories: scope.manageableGroupCategories,
      groupIds: parsedInput.groupIds,
      requireAtLeastOneGroup: false,
    });
    const email = normalizeEmail(parsedInput.email);
    const matchedUser = email ? await findUserByEmail(email) : null;

    if (matchedUser && matchedUser.id !== member.userId) {
      const existingLinkedMember = await getMemberByUserId(
        organization.id,
        matchedUser.id,
      );

      if (existingLinkedMember && existingLinkedMember.id !== member.id) {
        returnValidationErrors(updateMemberSchema, {
          email: {
            _errors: ["That user is already linked to another member record."],
          },
        });
      }
    }

    // Only the fields this actor may read are writable. Passing all of them
    // would clear every value the form did not carry back — an absent key
    // normalizes to null — so a scoped leader saving a member would silently
    // wipe the answers that were withheld from them.
    const { readable: customFields } = partitionFieldsByVisibility(
      await listMemberCustomFields(organization.id),
      scope.accessLevel,
    );

    const result = await db.transaction(async (tx) => {
      await tx
        .update(tenantMembers)
        .set({
          firstName: parsedInput.firstName.trim(),
          lastName: parsedInput.lastName.trim(),
          email,
          role: resolveAllowedRole(
            parsedInput.role,
            scope.canAssignElevatedRoles,
          ),
          status: parsedInput.status,
          userId: member.userId ?? matchedUser?.id ?? null,
          linkedAt:
            member.linkedAt ??
            (member.userId == null && matchedUser ? new Date() : null),
          // Linking an account is not consent; nothing is stamped here.
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
    }).catch((error: unknown) =>
      rethrowAsGroupIdsValidationError(updateMemberSchema, error),
    );

    return result;
  });

/**
 * Sends the deletion notice to everyone a soft delete actually removed.
 *
 * Reads the members after the write rather than before: soft delete keeps the
 * row, and `deletedMemberIds` says exactly who was affected, so there is no
 * need to guess which of a bulk selection went through.
 */
async function notifyDeletedMembers(args: {
  orgId: string;
  memberIds: string[];
  purgeAfter: Date | null;
}) {
  if (args.memberIds.length === 0) {
    return;
  }

  const rows = await db
    .select({
      id: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      workspaceUserEmail: tenantMembers.workspaceUserEmail,
      deletedAt: tenantMembers.deletedAt,
      purgeAfter: tenantMembers.purgeAfter,
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, args.orgId),
        inArray(tenantMembers.id, args.memberIds),
      ),
    );

  for (const row of rows) {
    await notifyMembershipDeleted({
      orgId: args.orgId,
      memberId: row.id,
      memberName:
        `${row.firstName} ${row.lastName}`.trim() || row.email || "Member",
      toEmail: row.email,
      workspaceEmail: row.workspaceUserEmail,
      deletedAt: row.deletedAt ?? new Date(),
      purgeAfter: row.purgeAfter ?? args.purgeAfter,
    });
  }
}

export const deleteMemberAction = authActionClient
  .metadata({ actionName: "deleteMember" })
  .inputSchema(deleteMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);

    await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });

    const result = await softDeleteMembers({
      actorUserId: ctx.auth.user.id,
      memberIds: [parsedInput.memberId],
      orgId: organization.id,
    });

    // After the response, not before it: the admin should not wait on Resend,
    // and a mail failure must not undo a deletion that already happened.
    after(() =>
      notifyDeletedMembers({
        orgId: organization.id,
        memberIds: result.deletedMemberIds,
        purgeAfter: result.purgeAfter,
      }),
    );

    return result;
  });

/**
 * Puts a soft-deleted member back.
 *
 * Scoped exactly like deletion: a group admin who could delete the member can
 * bring them back. `canAccessMemberInScope` reads `group_memberships`, and soft
 * delete leaves those rows alone, so a deleted member stays inside the same
 * admin's scope for the whole grace window.
 */
export const restoreMemberAction = authActionClient
  .metadata({ actionName: "restoreMember" })
  .inputSchema(restoreMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);

    await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
      includeDeleted: true,
    });

    return restoreMembers({
      memberIds: [parsedInput.memberId],
      orgId: organization.id,
    });
  });

/**
 * Declines a pending application and erases it. The record is deleted outright
 * rather than tagged, so the rejection email's promise that their details are
 * gone is literally true — and so a rejected person can apply again later
 * instead of hitting the "already registered" path.
 *
 * The only trace left is the `email_activities` row for the rejection email
 * itself, which necessarily holds the address the message went to.
 */
export const rejectMemberAction = authActionClient
  .metadata({ actionName: "rejectMember" })
  .inputSchema(rejectMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);
    const member = await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });

    if (member.status !== "pending") {
      throw new Error("Only a pending application can be rejected.");
    }

    // Read before the delete: nothing about this applicant survives it.
    const toEmail = member.email;
    const applicantName =
      `${member.firstName} ${member.lastName}`.trim() || toEmail || "Applicant";

    const result = await hardDeleteMembers({
      memberIds: [parsedInput.memberId],
      orgId: organization.id,
    });

    if (result.deletedCount === 0) {
      return result;
    }

    if (toEmail) {
      after(() =>
        notifyRegistrationRejected({
          orgId: organization.id,
          applicantName,
          toEmail,
          reason: parsedInput.reason,
        }),
      );
    }

    return result;
  });

export const bulkDeleteMembersAction = authActionClient
  .metadata({ actionName: "bulkDeleteMembers" })
  .inputSchema(bulkDeleteMembersSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);

    for (const memberId of parsedInput.memberIds) {
      await assertMemberInScopeOrThrow({
        orgId: organization.id,
        memberId,
        scope,
      });
    }

    const result = await softDeleteMembers({
      actorUserId: ctx.auth.user.id,
      memberIds: parsedInput.memberIds,
      orgId: organization.id,
    });

    after(() =>
      notifyDeletedMembers({
        orgId: organization.id,
        memberIds: result.deletedMemberIds,
        purgeAfter: result.purgeAfter,
      }),
    );

    return result;
  });

export const searchWorkspaceUsersAction = authActionClient
  .metadata({ actionName: "searchWorkspaceUsers" })
  .inputSchema(searchWorkspaceUsersSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();

    if (!isWorkspaceModuleReady(organization)) {
      return { users: [] as { id: string; primaryEmail: string; fullName: string }[] };
    }

    try {
      const users = await searchWorkspaceUsers(
        organization.id,
        parsedInput.query,
        5,
      );
      return { users };
    } catch (error) {
      if (
        error instanceof WorkspaceNotConnectedError ||
        error instanceof WorkspaceApiError
      ) {
        return { users: [] as { id: string; primaryEmail: string; fullName: string }[] };
      }
      throw error;
    }
  });

export const importMembersAction = authActionClient
  .metadata({ actionName: "importMembers" })
  .inputSchema(importMembersSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);

    const customFields = await listMemberCustomFields(organization.id);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < parsedInput.rows.length; i++) {
      const row = parsedInput.rows[i]!;
      const rowNum = i + 1;

      try {
        const email = row.email ? normalizeEmail(row.email) : null;
        const allowedRole = resolveAllowedRole(
          row.role,
          scope.canAssignElevatedRoles,
        );

        // Resolve all group IDs this row should be assigned to — must be within scope
        const uniqueGroupIds = [...new Set(row.groupIds)];
        const selectionError = uniqueGroupIds.length > 0
          ? (() => {
              const allAllowedGroupIds = new Set(
                scope.manageableGroupCategories.flatMap((c) =>
                  c.groups.map((g) => g.id),
                ),
              );
              const outsideScope = uniqueGroupIds.filter(
                (id) => !allAllowedGroupIds.has(id),
              );
              return outsideScope.length > 0
                ? `Group IDs not in scope: ${outsideScope.join(", ")}`
                : null;
            })()
          : null;

        if (selectionError) {
          errors.push({ row: rowNum, message: selectionError });
          skipped++;
          continue;
        }

        // Try to find an existing member
        const existingMember = email
          ? await (async () => {
              const user = await findUserByEmail(email);
              if (user) {
                const m = await getMemberByUserId(organization.id, user.id);
                if (m) return m;
              }
              // Also try by stored email on member record directly
              const [byEmail] = await db
                .select()
                .from(tenantMembers)
                .where(
                  and(
                    eq(tenantMembers.orgId, organization.id),
                    eq(tenantMembers.email, email),
                  ),
                )
                .limit(1);
              return byEmail ?? null;
            })()
          : null;

        if (existingMember) {
          // Update existing member
          await db.transaction(async (tx) => {
            await tx
              .update(tenantMembers)
              .set({
                firstName: row.firstName.trim() || existingMember.firstName,
                lastName: row.lastName.trim() || existingMember.lastName,
                email,
                role: allowedRole,
                status: row.status,
                workspaceUserId: row.workspaceUserId ?? existingMember.workspaceUserId,
                workspaceUserEmail: row.workspaceUserEmail ?? existingMember.workspaceUserEmail,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(tenantMembers.id, existingMember.id),
                  eq(tenantMembers.orgId, organization.id),
                ),
              );

            if (uniqueGroupIds.length > 0) {
              await syncManageableGroupMemberships({
                tx,
                orgId: organization.id,
                memberId: existingMember.id,
                allowedGroupIds: scope.manageableGroupCategories.flatMap((c) =>
                  c.groups.map((g) => g.id),
                ),
                nextGroupIds: uniqueGroupIds,
              });
            }

            await upsertMemberCustomFieldAnswers(tx, {
              orgId: organization.id,
              memberId: existingMember.id,
              fields: customFields,
              answers: row.customFieldAnswers,
            });
          });
          updated++;
        } else {
          // Insert new member
          const matchedUser = email ? await findUserByEmail(email) : null;
          await db.transaction(async (tx) => {
            const [{ id: memberId }] = await tx
              .insert(tenantMembers)
              .values({
                orgId: organization.id,
                userId: matchedUser?.id ?? null,
                email,
                firstName: row.firstName.trim(),
                lastName: row.lastName.trim(),
                role: allowedRole,
                status: row.status,
                workspaceUserId: row.workspaceUserId ?? null,
                workspaceUserEmail: row.workspaceUserEmail ?? null,
                linkedAt: matchedUser ? new Date() : null,
                // Imported members have never been shown anything. Backdating a
                // consent that did not happen is worse than an empty record:
                // they are asked at first login by the portal gate.
              })
              .returning({ id: tenantMembers.id });

            if (uniqueGroupIds.length > 0) {
              await syncManageableGroupMemberships({
                tx,
                orgId: organization.id,
                memberId: memberId!,
                allowedGroupIds: scope.manageableGroupCategories.flatMap((c) =>
                  c.groups.map((g) => g.id),
                ),
                nextGroupIds: uniqueGroupIds,
              });
            }

            await upsertMemberCustomFieldAnswers(tx, {
              orgId: organization.id,
              memberId: memberId!,
              fields: customFields,
              answers: row.customFieldAnswers,
            });
          });
          created++;
        }
      } catch (error) {
        errors.push({
          row: rowNum,
          message: error instanceof Error ? error.message : "Unexpected error",
        });
        skipped++;
      }
    }

    void ctx; // actor available for future audit logging

    return { created, updated, skipped, errors };
  });

// ─── Workspace Import Helpers ────────────────────────────────────────────────

export const batchLookupWorkspaceUsersAction = authActionClient
  .metadata({ actionName: "batchLookupWorkspaceUsers" })
  .inputSchema(batchLookupWorkspaceUsersSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();

    if (!isWorkspaceModuleReady(organization)) {
      return { results: {} as Record<string, { id: string; primaryEmail: string; fullName: string } | null> };
    }

    const results: Record<string, { id: string; primaryEmail: string; fullName: string } | null> = {};
    const emails = parsedInput.emails;

    const CONCURRENCY = 5;
    for (let i = 0; i < emails.length; i += CONCURRENCY) {
      const batch = emails.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(async (email) => {
          try {
            const user = await getWorkspaceUser(organization.id, email);
            results[email.toLowerCase()] = user;
          } catch {
            results[email.toLowerCase()] = null;
          }
        }),
      );
      void settled;
    }

    return { results };
  });

export const batchSuggestWorkspaceEmailsAction = authActionClient
  .metadata({ actionName: "batchSuggestWorkspaceEmails" })
  .inputSchema(batchSuggestWorkspaceEmailsSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();

    if (
      !isWorkspaceModuleReady(organization) ||
      !organization.workspaceDomain
    ) {
      return { suggestions: parsedInput.rows.map(() => "") };
    }

    const template =
      organization.workspaceEmailTemplate ?? DEFAULT_WORKSPACE_EMAIL_TEMPLATE;

    const suggestions = parsedInput.rows.map((row) =>
      buildWorkspaceEmail({
        template,
        firstName: row.firstName,
        lastName: row.lastName,
        domain: organization.workspaceDomain!,
      }),
    );

    return { suggestions };
  });

export const createWorkspaceAccountAction = authActionClient
  .metadata({ actionName: "createWorkspaceAccount" })
  .inputSchema(createWorkspaceAccountSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await requireOrganization();

    if (!isWorkspaceModuleReady(organization)) {
      return { success: false as const, error: "Workspace is not connected." };
    }

    const password = generateRandomPassword(20);

    let workspaceUserId: string;
    let primaryEmail: string;
    try {
      const created = await createWorkspaceUser(organization.id, {
        primaryEmail: parsedInput.primaryEmail,
        firstName: parsedInput.firstName,
        lastName: parsedInput.lastName,
        password,
        extraFields: parsedInput.extraFields,
      });
      workspaceUserId = created.id;
      primaryEmail = created.primaryEmail;
    } catch (error) {
      if (error instanceof WorkspaceApiError) {
        if (error.status === 409 || error.reason === "duplicate") {
          return {
            success: false as const,
            error: "Email already taken in Workspace.",
          };
        }
      }
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Provisioning failed.",
      };
    }

    // The welcome email carries the temporary password, so it is only useful
    // in an inbox the member can already open. Sending it to `primaryEmail`
    // (the Workspace mailbox we just created) locks the credentials inside the
    // account they unlock.
    const notifyEmail = parsedInput.notifyEmail?.trim().toLowerCase();
    const canNotify = Boolean(notifyEmail) && notifyEmail !== primaryEmail.toLowerCase();
    let welcomeEmailSent = false;

    if (parsedInput.sendWelcomeEmail && canNotify) {
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, organization.id))
        .limit(1);

      const organizationName = org?.name ?? "Your organization";
      const memberName = [parsedInput.firstName, parsedInput.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || primaryEmail;
      const signInUrl = buildAbsoluteAppUrl("/login");

      // Account created successfully; a refused email is logged by the door
      // and reported through `welcomeEmailSent`, not as a failure.
      const welcome = await sendEmail({
        orgId: organization.id,
        kind: "workspace_welcome",
        to: { email: notifyEmail!, name: memberName },
        actorUserId: ctx.auth.user.id,
        metadata: { workspaceUserId },
        subject: getDictionary().emails.workspaceWelcome.subject(organizationName),
        react: WorkspaceWelcomeEmail({
          organizationName,
          memberName,
          workspaceEmail: primaryEmail,
          temporaryPassword: password,
          signInUrl,
          // No member record is involved here, so there is no fee to quote.
          payment: null,
        }),
        idempotencyKey: `workspace-welcome/${workspaceUserId}`,
      });
      welcomeEmailSent = welcome.sent;
    }

    return {
      success: true as const,
      workspaceUserId,
      primaryEmail,
      welcomeEmailSent,
      /** Set when the caller asked for a welcome email we could not address. */
      welcomeEmailSkipped: parsedInput.sendWelcomeEmail && !canNotify,
    };
  });

/**
 * Creates the Google account for a member who already exists — the case the
 * approval flow skipped, or a member created without one. Membership status is
 * left alone on purpose: this is provisioning, not approval.
 */
export const provisionMemberWorkspaceAccountAction = authActionClient
  .metadata({ actionName: "provisionMemberWorkspaceAccount" })
  .inputSchema(provisionMemberWorkspaceAccountSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [organization, scope] = await Promise.all([
      requireOrganization(),
      resolveMemberManagementScope(ctx.viewer),
    ]);
    const member = await assertMemberInScopeOrThrow({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      scope,
    });

    if (!isWorkspaceModuleReady(organization)) {
      throw new Error(
        "Google Workspace is not connected. Connect it in Settings → Google Workspace first.",
      );
    }

    if (member.workspaceUserId) {
      throw new Error(
        `This member already has a Workspace account (${member.workspaceUserEmail ?? "linked"}).`,
      );
    }

    const provision = await provisionWorkspaceAccountForMember({
      orgId: organization.id,
      memberId: parsedInput.memberId,
      firstName: member.firstName ?? "",
      lastName: member.lastName ?? "",
      primaryEmail: parsedInput.primaryEmail.trim().toLowerCase(),
      toEmail: (member.email ?? "").trim().toLowerCase(),
      actorUserId: ctx.auth.user.id,
      extraFields: parsedInput.extraFields,
    });

    if (!provision.success) {
      return {
        success: false as const,
        error: provision.error,
        reason: provision.reason ?? null,
      };
    }

    return {
      success: true as const,
      primaryEmail: provision.primaryEmail,
    };
  });

export const getProvisionFieldDefaultsAction = authActionClient
  .metadata({ actionName: "getProvisionFieldDefaults" })
  .inputSchema(z.object({ memberId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();

    const provisionFieldConfigs = (organization.workspaceProvisionFields ?? []) as import("@/server/lib/workspace/field-catalog").WorkspaceProvisionFieldConfig[];

    // Find the org unit category
    const [ouCategory] = await db
      .select({ id: groupCategories.id })
      .from(groupCategories)
      .where(
        and(
          eq(groupCategories.orgId, organization.id),
          eq(groupCategories.specialCapability, "workspace_org_unit"),
        ),
      )
      .limit(1);

    const defaults = await resolveProvisionFieldsForMember(
      organization.id,
      parsedInput.memberId,
      provisionFieldConfigs,
      ouCategory?.id ?? null,
    );

    return { defaults };
  });
