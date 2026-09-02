"use server";

import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";

import {
  createGroupWorkspaceLinkSchema,
  deleteGroupWorkspaceLinkSchema,
  previewGroupWorkspaceLinkSchema,
  syncGroupWorkspaceLinkSchema,
  updateGroupWorkspaceLinkSchema,
} from "@/lib/workspace-group-links";
import { authActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import {
  groupWorkspaceLinks,
  groups,
  workspaceGroupMemberLinks,
} from "@/server/db/schema";
import { requireWorkspaceLinkAccess } from "@/server/queries/access";
import { getGroupWorkspaceLink } from "@/server/queries/workspace-group-links";
import { getWorkspaceGroup } from "@/server/lib/workspace/client";
import {
  applyPlan,
  buildPlanRows,
  enqueueOperations,
  planLinkSync,
} from "@/server/lib/workspace/group-links";
import { recordLinkDrift } from "@/server/lib/workspace/drift";
import { drainWorkspaceSyncOperations } from "@/server/lib/workspace/sync-queue";

async function requireLinkForEdit(linkId: string) {
  const [existing] = await db
    .select({ groupId: groupWorkspaceLinks.groupId })
    .from(groupWorkspaceLinks)
    .where(eq(groupWorkspaceLinks.id, linkId))
    .limit(1);

  if (!existing) {
    throw new Error("That Workspace link no longer exists.");
  }

  const context = await requireWorkspaceLinkAccess(existing.groupId);
  const link = await getGroupWorkspaceLink(context.organization.id, linkId);

  if (!link) {
    throw new Error("That Workspace link no longer exists.");
  }

  return { context, link };
}

/**
 * Links are one-to-one in both directions: a Spoleek group has at most one
 * Google group, and a Google group is claimed by at most one Spoleek group.
 * The unique indexes enforce it; this turns the constraint violation into a
 * message that says which side is already taken.
 */
async function findConflictingLink(
  orgId: string,
  groupId: string,
  workspaceGroupId: string,
) {
  const [byGroup] = await db
    .select({ workspaceGroupEmail: groupWorkspaceLinks.workspaceGroupEmail })
    .from(groupWorkspaceLinks)
    .where(
      and(
        eq(groupWorkspaceLinks.orgId, orgId),
        eq(groupWorkspaceLinks.groupId, groupId),
      ),
    )
    .limit(1);

  if (byGroup) {
    return `This group is already linked to ${byGroup.workspaceGroupEmail}. Unlink it first.`;
  }

  const [byTarget] = await db
    .select({ groupName: groups.name })
    .from(groupWorkspaceLinks)
    .innerJoin(groups, eq(groups.id, groupWorkspaceLinks.groupId))
    .where(
      and(
        eq(groupWorkspaceLinks.orgId, orgId),
        eq(groupWorkspaceLinks.workspaceGroupId, workspaceGroupId),
      ),
    )
    .limit(1);

  if (byTarget) {
    return `That Google group is already linked to “${byTarget.groupName}”.`;
  }

  return null;
}

/**
 * Dry run. Nothing is written to Google or to the ledger — the admin sees
 * exactly what linking would do and confirms before anything happens.
 */
export const previewGroupWorkspaceLinkAction = authActionClient
  .metadata({ actionName: "previewGroupWorkspaceLink" })
  .inputSchema(previewGroupWorkspaceLinkSchema)
  .action(async ({ parsedInput }) => {
    const context = await requireWorkspaceLinkAccess(parsedInput.groupId);

    const target = await getWorkspaceGroup(
      context.organization.id,
      parsedInput.workspaceGroupKey,
    );

    if (!target) {
      returnValidationErrors(previewGroupWorkspaceLinkSchema, {
        workspaceGroupKey: {
          _errors: ["That Google group could not be found."],
        },
      });
    }

    const conflict = await findConflictingLink(
      context.organization.id,
      parsedInput.groupId,
      target.id,
    );

    if (conflict) {
      returnValidationErrors(previewGroupWorkspaceLinkSchema, {
        workspaceGroupKey: { _errors: [conflict] },
      });
    }

    // The link that does not exist yet is passed in as a virtual one, so the
    // preview runs the identical reconciler without leaving a row behind.
    const preview = await planLinkSync(
      {
        orgId: context.organization.id,
        workspaceGroupId: target.id,
        workspaceGroupEmail: target.email,
        direction: parsedInput.direction,
        removalPolicy: parsedInput.removalPolicy,
      },
      {
        groupId: parsedInput.groupId,
        memberRole: parsedInput.memberRole,
        adminRole: parsedInput.adminRole,
        includeExternal: parsedInput.includeExternal,
      },
    );

    return {
      workspaceGroupId: target.id,
      workspaceGroupEmail: preview.workspaceGroupEmail,
      workspaceGroupName: preview.workspaceGroupName,
      addCount: preview.plan.add.length,
      removeCount: preview.plan.remove.length,
      adoptCount: preview.plan.adopt.length,
      roleChangeCount: preview.plan.roleChange.length,
      driftCount: preview.plan.drift.length,
      skippedCount: preview.skipped.length,
      rows: await buildPlanRows(
        context.organization.id,
        preview.plan,
        preview.skipped,
      ),
    };
  });

export const createGroupWorkspaceLinkAction = authActionClient
  .metadata({ actionName: "createGroupWorkspaceLink" })
  .inputSchema(createGroupWorkspaceLinkSchema)
  .action(async ({ parsedInput }) => {
    const context = await requireWorkspaceLinkAccess(parsedInput.groupId);

    const target = await getWorkspaceGroup(
      context.organization.id,
      parsedInput.workspaceGroupKey,
    );

    if (!target) {
      returnValidationErrors(createGroupWorkspaceLinkSchema, {
        workspaceGroupKey: {
          _errors: ["That Google group could not be found."],
        },
      });
    }

    const conflict = await findConflictingLink(
      context.organization.id,
      parsedInput.groupId,
      target.id,
    );

    if (conflict) {
      returnValidationErrors(createGroupWorkspaceLinkSchema, {
        workspaceGroupKey: { _errors: [conflict] },
      });
    }

    const [link] = await db
      .insert(groupWorkspaceLinks)
      .values({
        orgId: context.organization.id,
        groupId: parsedInput.groupId,
        workspaceGroupId: target.id,
        workspaceGroupEmail: target.email,
        workspaceGroupName: target.name,
        direction: parsedInput.direction,
        memberRole: parsedInput.memberRole,
        adminRole: parsedInput.adminRole,
        removalPolicy: parsedInput.removalPolicy,
        includeExternal: parsedInput.includeExternal,
      })
      .onConflictDoNothing()
      .returning();

    if (!link) {
      returnValidationErrors(createGroupWorkspaceLinkSchema, {
        workspaceGroupKey: {
          _errors: ["That link already exists."],
        },
      });
    }

    const preview = await planLinkSync(link);
    const applied = await applyPlan(link, preview.plan);
    await recordLinkDrift(link, preview.plan.drift);

    after(() => drainWorkspaceSyncOperations({ linkId: link.id }));

    return {
      success: true,
      linkId: link.id,
      queued: applied.queued,
      adopted: applied.adopted,
      driftCount: preview.plan.drift.length,
    };
  });

export const updateGroupWorkspaceLinkAction = authActionClient
  .metadata({ actionName: "updateGroupWorkspaceLink" })
  .inputSchema(updateGroupWorkspaceLinkSchema)
  .action(async ({ parsedInput }) => {
    const { context } = await requireLinkForEdit(parsedInput.linkId);

    await db
      .update(groupWorkspaceLinks)
      .set({
        direction: parsedInput.direction,
        memberRole: parsedInput.memberRole,
        adminRole: parsedInput.adminRole,
        removalPolicy: parsedInput.removalPolicy,
        includeExternal: parsedInput.includeExternal,
        isEnabled: parsedInput.isEnabled,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groupWorkspaceLinks.id, parsedInput.linkId),
          eq(groupWorkspaceLinks.orgId, context.organization.id),
        ),
      );

    return { success: true };
  });

/**
 * "Sync now". With `apply: false` it is the same dry run the link dialog shows,
 * which is what makes the preview and the real sync impossible to disagree.
 */
export const syncGroupWorkspaceLinkAction = authActionClient
  .metadata({ actionName: "syncGroupWorkspaceLink" })
  .inputSchema(syncGroupWorkspaceLinkSchema)
  .action(async ({ parsedInput }) => {
    const { link } = await requireLinkForEdit(parsedInput.linkId);

    const preview = await planLinkSync(link);

    // The Google group may have been renamed since the last sync.
    if (
      preview.workspaceGroupEmail !== link.workspaceGroupEmail ||
      preview.workspaceGroupName !== link.workspaceGroupName
    ) {
      await db
        .update(groupWorkspaceLinks)
        .set({
          workspaceGroupEmail: preview.workspaceGroupEmail,
          workspaceGroupName: preview.workspaceGroupName,
          updatedAt: new Date(),
        })
        .where(eq(groupWorkspaceLinks.id, link.id));
    }

    const applied = parsedInput.apply
      ? await applyPlan(link, preview.plan)
      : { queued: 0, adopted: 0 };

    // Recorded on a dry run too: looking is what makes drift visible, and the
    // admin has already paid for the `members.list` call either way.
    await recordLinkDrift(link, preview.plan.drift);

    if (parsedInput.apply) {
      after(() => drainWorkspaceSyncOperations({ linkId: link.id }));
    }

    return {
      success: true,
      applied: parsedInput.apply,
      addCount: preview.plan.add.length,
      removeCount: preview.plan.remove.length,
      adoptCount: preview.plan.adopt.length,
      roleChangeCount: preview.plan.roleChange.length,
      driftCount: preview.plan.drift.length,
      skippedCount: preview.skipped.length,
      rows: await buildPlanRows(link.orgId, preview.plan, preview.skipped),
      queued: applied.queued,
    };
  });

export const deleteGroupWorkspaceLinkAction = authActionClient
  .metadata({ actionName: "deleteGroupWorkspaceLink" })
  .inputSchema(deleteGroupWorkspaceLinkSchema)
  .action(async ({ parsedInput }) => {
    const { link } = await requireLinkForEdit(parsedInput.linkId);

    const owned = await db
      .select({ address: workspaceGroupMemberLinks.address })
      .from(workspaceGroupMemberLinks)
      .where(eq(workspaceGroupMemberLinks.linkId, link.id));

    if (parsedInput.removeMemberships && link.direction === "push") {
      await enqueueOperations(
        link.orgId,
        link.id,
        owned.map((row) => ({
          kind: "remove_member" as const,
          address: row.address,
          role: null,
          memberId: null,
        })),
      );

      // Drain before the cascade takes the queued rows with the link.
      await drainWorkspaceSyncOperations({ linkId: link.id });
    }

    await db
      .delete(groupWorkspaceLinks)
      .where(eq(groupWorkspaceLinks.id, link.id));

    return { success: true, removedCount: parsedInput.removeMemberships ? owned.length : 0 };
  });
