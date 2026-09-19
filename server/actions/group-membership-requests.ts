"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";

import {
  decideJoinRequestSchema,
  joinGroupSchema,
  leaveGroupSchema,
  requestToJoinGroupSchema,
  setJoinRequestBlockSchema,
  withdrawJoinRequestSchema,
} from "@/lib/groups";
import {
  type PortalActiveGroup,
  resolveAvailableAction,
  resolveLeave,
} from "@/lib/groups/portal-actions";
import { getDictionary } from "@/lib/i18n";
import { authActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { groupCategories, groupMemberships, groups } from "@/server/db/schema";
import { upsertActiveMembership } from "@/server/lib/group-membership";
import { updateWorkspaceUserOrgUnit } from "@/server/lib/workspace/client";
import { enqueueMemberSyncForGroup } from "@/server/lib/workspace/group-links";
import { drainWorkspaceSyncOperations } from "@/server/lib/workspace/sync-queue";
import {
  notifyJoinDecided,
  notifyJoinRequested,
} from "@/server/notifications/group-join-requests";
import {
  requireCurrentMemberAccess,
  requireGroupManagementAccess,
  requireOrganization,
} from "@/server/queries/access";
import { getMemberById } from "@/server/queries/members";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const t = getDictionary().portalGroupActions;

/**
 * The group and its category, or a user-readable error. Inactive groups and
 * categories are treated as missing: the portal never showed them, so any
 * request naming one is stale or forged.
 */
async function loadGroup(tx: Tx, orgId: string, groupId: string) {
  const [row] = await tx
    .select({
      id: groups.id,
      name: groups.name,
      categoryId: groups.categoryId,
      joinPolicy: groups.joinPolicy,
      workspaceOrgUnitPath: groups.workspaceOrgUnitPath,
      categorySpecialCapability: groupCategories.specialCapability,
      category: {
        selectionMode: groupCategories.selectionMode,
        maxSelections: groupCategories.maxSelections,
        selectionRequired: groupCategories.selectionRequired,
        showGroupsToNonMembers: groupCategories.showGroupsToNonMembers,
      },
    })
    .from(groups)
    .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
    .where(
      and(
        eq(groups.orgId, orgId),
        eq(groups.id, groupId),
        eq(groups.isActive, true),
        eq(groupCategories.isActive, true),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(t.groupNotFound);
  }

  return row;
}

/**
 * The member's row on this group, locked for the rest of the transaction so
 * two clicks (or a member and an approver) cannot both act on the same state.
 * Locking a missing row is impossible; the unique index turns the losing
 * insert into a conflict instead, which `upsertActiveMembership` absorbs.
 */
async function lockOwnRow(tx: Tx, orgId: string, groupId: string, memberId: string) {
  const [row] = await tx
    .select({
      id: groupMemberships.id,
      status: groupMemberships.status,
      role: groupMemberships.role,
      requestedAt: groupMemberships.requestedAt,
      decidedAt: groupMemberships.decidedAt,
      declineReason: groupMemberships.declineReason,
      requestsBlocked: groupMemberships.requestsBlocked,
    })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.groupId, groupId),
        eq(groupMemberships.memberId, memberId),
      ),
    )
    .for("update")
    .limit(1);

  return row ?? null;
}

/** The member's active groups in a category, minus `exceptGroupId`. */
async function listMyActiveInCategory(
  tx: Tx,
  orgId: string,
  memberId: string,
  categoryId: string,
  exceptGroupId: string | null,
): Promise<PortalActiveGroup[]> {
  const rows = await tx
    .select({ id: groups.id, name: groups.name, joinPolicy: groups.joinPolicy })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.memberId, memberId),
        eq(groupMemberships.status, "active"),
        eq(groups.categoryId, categoryId),
        eq(groups.isActive, true),
      ),
    );

  return rows.filter((row) => row.id !== exceptGroupId);
}

/**
 * Everything that has to follow a change in who is in a group: Workspace
 * group sync and, for org-unit categories, the user's OU. Mirrors what
 * `assignGroupMemberAction` does so a self-service join is indistinguishable
 * from an admin assignment downstream.
 */
async function afterMembershipChange(
  orgId: string,
  group: { id: string; workspaceOrgUnitPath: string | null; categorySpecialCapability: string | null },
  memberIds: string[],
) {
  await enqueueMemberSyncForGroup(orgId, group.id, memberIds);
  after(() => drainWorkspaceSyncOperations({ orgId }));

  if (group.categorySpecialCapability === "workspace_org_unit" && group.workspaceOrgUnitPath) {
    for (const memberId of memberIds) {
      const member = await getMemberById(orgId, memberId);
      if (member?.workspaceUserEmail) {
        await updateWorkspaceUserOrgUnit(orgId, member.workspaceUserEmail, group.workspaceOrgUnitPath);
      }
    }
  }
}

function revalidatePortal() {
  revalidatePath("/portal/groups");
  revalidatePath("/portal");
}

function revalidateAdmin(categoryId: string, groupId: string) {
  revalidatePath(`/admin/groups/${categoryId}/${groupId}`);
  revalidatePath(`/admin/groups/${categoryId}`);
  revalidatePath("/admin/groups", "layout");
  revalidatePath("/admin");
}

/** Fire-and-forget: a mail failure must never undo a membership change. */
async function tryNotify(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    console.error("Join request notification failed", error);
  }
}

// ─── Member side ─────────────────────────────────────────────────────────────

const memberGate = {
  requireProfileComplete: true,
  requirePolicyAcknowledgement: true,
} as const;

export const joinGroupAction = authActionClient
  .metadata({ actionName: "joinGroup" })
  .inputSchema(joinGroupSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { organization, member } = await requireCurrentMemberAccess(ctx.viewer, memberGate);

    const result = await db.transaction(async (tx) => {
      const group = await loadGroup(tx, organization.id, parsedInput.groupId);
      const row = await lockOwnRow(tx, organization.id, group.id, member.id);

      if (row?.status === "active") {
        throw new Error(t.alreadyMember);
      }

      if (group.joinPolicy !== "free_join_leave") {
        throw new Error(t.joinNotAllowed);
      }

      const mine = await listMyActiveInCategory(tx, organization.id, member.id, group.categoryId, group.id);
      const action = resolveAvailableAction({
        group,
        // A declined row does not stop a free join; only the fresh rules matter.
        row: row?.status === "pending" ? row : null,
        category: group.category,
        myActiveInCategory: mine,
      });

      if (action?.kind === "pending") {
        throw new Error(t.requestAlreadyPending);
      }

      if (action?.kind !== "join" && action?.kind !== "switch") {
        throw new Error(t.joinNotAllowed);
      }

      let left: string | null = null;
      if (action.kind === "switch") {
        await tx
          .delete(groupMemberships)
          .where(
            and(
              eq(groupMemberships.orgId, organization.id),
              eq(groupMemberships.groupId, action.from.id),
              eq(groupMemberships.memberId, member.id),
            ),
          );
        left = action.from.id;
      }

      await upsertActiveMembership(tx, { orgId: organization.id, groupId: group.id, memberId: member.id });

      return { group, left };
    });

    await afterMembershipChange(organization.id, result.group, [member.id]);
    if (result.left) {
      await enqueueMemberSyncForGroup(organization.id, result.left, [member.id]);
    }
    revalidatePortal();
    revalidateAdmin(result.group.categoryId, result.group.id);

    return { success: true as const, switchedFrom: result.left };
  });

export const leaveGroupAction = authActionClient
  .metadata({ actionName: "leaveGroup" })
  .inputSchema(leaveGroupSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { organization, member } = await requireCurrentMemberAccess(ctx.viewer, memberGate);

    const group = await db.transaction(async (tx) => {
      const group = await loadGroup(tx, organization.id, parsedInput.groupId);
      const row = await lockOwnRow(tx, organization.id, group.id, member.id);

      if (row?.status !== "active") {
        throw new Error(t.notMember);
      }

      const mine = await listMyActiveInCategory(tx, organization.id, member.id, group.categoryId, null);
      const leave = resolveLeave(group, group.category, mine);

      if (!leave.canLeave) {
        throw new Error(leave.reason === "selection_required" ? t.leaveSelectionRequired : t.leaveNotAllowed);
      }

      await tx.delete(groupMemberships).where(eq(groupMemberships.id, row.id));

      return group;
    });

    await afterMembershipChange(organization.id, group, [member.id]);
    revalidatePortal();
    revalidateAdmin(group.categoryId, group.id);

    return { success: true as const };
  });

export const requestToJoinGroupAction = authActionClient
  .metadata({ actionName: "requestToJoinGroup" })
  .inputSchema(requestToJoinGroupSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { organization, member } = await requireCurrentMemberAccess(ctx.viewer, memberGate);

    const group = await db.transaction(async (tx) => {
      const group = await loadGroup(tx, organization.id, parsedInput.groupId);
      const row = await lockOwnRow(tx, organization.id, group.id, member.id);

      if (row?.status === "active") {
        throw new Error(t.alreadyMember);
      }

      if (group.joinPolicy !== "request_to_join") {
        throw new Error(t.requestNotAllowed);
      }

      const mine = await listMyActiveInCategory(tx, organization.id, member.id, group.categoryId, group.id);
      const action = resolveAvailableAction({ group, row, category: group.category, myActiveInCategory: mine });

      if (action?.kind === "pending") {
        throw new Error(t.requestAlreadyPending);
      }

      if (action?.kind === "declined") {
        if (!action.canRequestAgain) {
          throw new Error(row?.requestsBlocked ? t.requestsBlocked : t.requestNotAllowed);
        }
      } else if (action?.kind !== "request") {
        throw new Error(t.requestNotAllowed);
      }

      const now = new Date();
      const requestFields = {
        status: "pending" as const,
        role: "member" as const,
        requestMessage: parsedInput.message,
        requestedAt: now,
        decidedAt: null,
        decidedByMemberId: null,
        declineReason: null,
        requestsBlocked: false,
        updatedAt: now,
      };

      if (row) {
        await tx.update(groupMemberships).set(requestFields).where(eq(groupMemberships.id, row.id));
      } else {
        await tx.insert(groupMemberships).values({
          orgId: organization.id,
          groupId: group.id,
          memberId: member.id,
          ...requestFields,
        });
      }

      return group;
    });

    revalidatePortal();
    revalidateAdmin(group.categoryId, group.id);
    await tryNotify(() =>
      notifyJoinRequested({
        orgId: organization.id,
        groupId: group.id,
        memberId: member.id,
        message: parsedInput.message,
      }),
    );

    return { success: true as const };
  });

export const withdrawJoinRequestAction = authActionClient
  .metadata({ actionName: "withdrawJoinRequest" })
  .inputSchema(withdrawJoinRequestSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { organization, member } = await requireCurrentMemberAccess(ctx.viewer, memberGate);

    const group = await db.transaction(async (tx) => {
      const group = await loadGroup(tx, organization.id, parsedInput.groupId);
      const row = await lockOwnRow(tx, organization.id, group.id, member.id);

      if (row?.status !== "pending") {
        throw new Error(t.noPendingRequest);
      }

      await tx.delete(groupMemberships).where(eq(groupMemberships.id, row.id));

      return group;
    });

    revalidatePortal();
    revalidateAdmin(group.categoryId, group.id);

    return { success: true as const };
  });

// ─── Approver side ───────────────────────────────────────────────────────────

/**
 * Approve or decline. One action for both so the "already handled" race is
 * handled once: whoever locks the row second sees it is no longer pending.
 */
export const decideJoinRequestAction = authActionClient
  .metadata({ actionName: "decideJoinRequest" })
  .inputSchema(decideJoinRequestSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await requireOrganization();
    const { member: approver } = await requireGroupManagementAccess(ctx.viewer, parsedInput.groupId);

    const group = await db.transaction(async (tx) => {
      const group = await loadGroup(tx, organization.id, parsedInput.groupId);
      const row = await lockOwnRow(tx, organization.id, group.id, parsedInput.memberId);

      if (row?.status !== "pending") {
        throw new Error(t.requestAlreadyHandled);
      }

      const now = new Date();

      if (parsedInput.decision === "approve") {
        await tx
          .update(groupMemberships)
          .set({
            status: "active",
            requestMessage: null,
            decidedAt: now,
            decidedByMemberId: approver?.id ?? null,
            declineReason: null,
            requestsBlocked: false,
            updatedAt: now,
          })
          .where(eq(groupMemberships.id, row.id));
      } else {
        await tx
          .update(groupMemberships)
          .set({
            status: "declined",
            decidedAt: now,
            decidedByMemberId: approver?.id ?? null,
            declineReason: parsedInput.reason,
            requestsBlocked: parsedInput.blockFurtherRequests,
            updatedAt: now,
          })
          .where(eq(groupMemberships.id, row.id));
      }

      return group;
    });

    if (parsedInput.decision === "approve") {
      await afterMembershipChange(organization.id, group, [parsedInput.memberId]);
    }
    revalidatePortal();
    revalidateAdmin(group.categoryId, group.id);
    await tryNotify(() =>
      notifyJoinDecided({
        orgId: organization.id,
        groupId: group.id,
        memberId: parsedInput.memberId,
        decision: parsedInput.decision,
        reason: parsedInput.reason,
      }),
    );

    return { success: true as const };
  });

export const setJoinRequestBlockAction = authActionClient
  .metadata({ actionName: "setJoinRequestBlock" })
  .inputSchema(setJoinRequestBlockSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await requireOrganization();
    await requireGroupManagementAccess(ctx.viewer, parsedInput.groupId);

    const group = await db.transaction(async (tx) => {
      const group = await loadGroup(tx, organization.id, parsedInput.groupId);
      const row = await lockOwnRow(tx, organization.id, group.id, parsedInput.memberId);

      if (row?.status !== "declined") {
        throw new Error(t.requestNotDeclined);
      }

      await tx
        .update(groupMemberships)
        .set({ requestsBlocked: parsedInput.blocked, updatedAt: new Date() })
        .where(eq(groupMemberships.id, row.id));

      return group;
    });

    revalidatePortal();
    revalidateAdmin(group.categoryId, group.id);

    return { success: true as const };
  });
