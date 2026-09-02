"use server";

import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import {
  adoptWorkspaceGroupDriftSchema,
  ignoreWorkspaceGroupDriftSchema,
  removeWorkspaceGroupDriftSchema,
} from "@/lib/workspace-group-drift";
import { authActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { groupWorkspaceLinks, workspaceGroupDrift } from "@/server/db/schema";
import { requireWorkspaceLinkAccess } from "@/server/queries/access";
import {
  adoptDriftAddress,
  adoptSkipMessages,
} from "@/server/lib/workspace/adopt-drift";
import { clearLinkDrift } from "@/server/lib/workspace/drift";
import { enqueueOperations } from "@/server/lib/workspace/group-links";
import { drainWorkspaceSyncOperations } from "@/server/lib/workspace/sync-queue";

type DriftSelection = {
  link: {
    id: string;
    orgId: string;
    groupId: string;
    workspaceGroupId: string;
    workspaceGroupEmail: string;
    direction: "push" | "observe";
    includeExternal: boolean;
  };
  rows: Array<{ id: string; address: string; memberType: string }>;
};

/**
 * Load the selected drift rows and check access once per link rather than once
 * per row. Selections routinely come from a single group's inbox, so this is
 * one guard call in practice; it still holds if a future org-wide inbox mixes
 * links from several groups.
 */
async function loadDriftSelection(driftIds: string[]) {
  const rows = await db
    .select({
      id: workspaceGroupDrift.id,
      address: workspaceGroupDrift.address,
      memberType: workspaceGroupDrift.memberType,
      linkId: workspaceGroupDrift.linkId,
      orgId: workspaceGroupDrift.orgId,
      groupId: groupWorkspaceLinks.groupId,
      workspaceGroupId: groupWorkspaceLinks.workspaceGroupId,
      workspaceGroupEmail: groupWorkspaceLinks.workspaceGroupEmail,
      direction: groupWorkspaceLinks.direction,
      includeExternal: groupWorkspaceLinks.includeExternal,
    })
    .from(workspaceGroupDrift)
    .innerJoin(
      groupWorkspaceLinks,
      eq(groupWorkspaceLinks.id, workspaceGroupDrift.linkId),
    )
    .where(inArray(workspaceGroupDrift.id, driftIds));

  if (rows.length === 0) {
    throw new Error("Those addresses have already been dealt with.");
  }

  const byLink = new Map<string, DriftSelection>();

  for (const row of rows) {
    const existing = byLink.get(row.linkId);

    if (existing) {
      existing.rows.push({
        id: row.id,
        address: row.address,
        memberType: row.memberType,
      });
      continue;
    }

    byLink.set(row.linkId, {
      link: {
        id: row.linkId,
        orgId: row.orgId,
        groupId: row.groupId,
        workspaceGroupId: row.workspaceGroupId,
        workspaceGroupEmail: row.workspaceGroupEmail,
        direction: row.direction,
        includeExternal: row.includeExternal,
      },
      rows: [{ id: row.id, address: row.address, memberType: row.memberType }],
    });
  }

  for (const selection of byLink.values()) {
    const context = await requireWorkspaceLinkAccess(selection.link.groupId);

    if (context.organization.id !== selection.link.orgId) {
      throw new Error("Those addresses belong to another organization.");
    }
  }

  return [...byLink.values()];
}

/**
 * Adopt: the Google group knew about someone Spoleek did not. Creating the
 * membership is what turns the integration into a way of discovering members
 * rather than just a mailing-list writer.
 */
export const adoptWorkspaceGroupDriftAction = authActionClient
  .metadata({ actionName: "adoptWorkspaceGroupDrift" })
  .inputSchema(adoptWorkspaceGroupDriftSchema)
  .action(async ({ parsedInput }) => {
    const selections = await loadDriftSelection(parsedInput.driftIds);

    let adopted = 0;
    let createdMembers = 0;
    const skipped: string[] = [];

    for (const { link, rows } of selections) {
      const resolved: string[] = [];

      for (const row of rows) {
        // A nested group or a whole-domain entry is not a person; leave it as
        // drift so the admin can ignore it instead.
        if (row.memberType.toUpperCase() !== "USER") {
          skipped.push(`${row.address} is not a person.`);
          continue;
        }

        const result = await adoptDriftAddress(link, row.address);

        if (result.status === "skipped") {
          skipped.push(`${row.address} ${adoptSkipMessages[result.reason]}`);
          continue;
        }

        adopted += 1;
        if (result.createdMember) createdMembers += 1;
        resolved.push(row.address);
      }

      // Only the rows that actually became memberships leave the inbox; the
      // rest stay so the admin can see why nothing happened to them.
      await clearLinkDrift(link.id, resolved);
    }

    return { success: true, adopted, createdMembers, skipped };
  });

/**
 * Remove: delete the address from Google. Only a `push` link may do this — an
 * `observe` link's whole promise is that Spoleek never writes.
 */
export const removeWorkspaceGroupDriftAction = authActionClient
  .metadata({ actionName: "removeWorkspaceGroupDrift" })
  .inputSchema(removeWorkspaceGroupDriftSchema)
  .action(async ({ parsedInput }) => {
    const selections = await loadDriftSelection(parsedInput.driftIds);

    let queued = 0;

    for (const { link, rows } of selections) {
      if (link.direction !== "push") {
        throw new Error(
          `${link.workspaceGroupEmail} is watch-only, so Spoleek cannot remove anyone from it. Switch the link to “Spoleek manages this group” first.`,
        );
      }

      queued += await enqueueOperations(
        link.orgId,
        link.id,
        rows.map((row) => ({
          kind: "remove_member" as const,
          address: row.address,
          role: null,
          memberId: null,
        })),
      );

      // Cleared now rather than on confirmation: if the removal never lands,
      // the nightly reconcile finds the address again and re-opens the row.
      await clearLinkDrift(
        link.id,
        rows.map((row) => row.address),
      );

      after(() => drainWorkspaceSyncOperations({ linkId: link.id }));
    }

    return { success: true, queued };
  });

export const ignoreWorkspaceGroupDriftAction = authActionClient
  .metadata({ actionName: "ignoreWorkspaceGroupDrift" })
  .inputSchema(ignoreWorkspaceGroupDriftSchema)
  .action(async ({ parsedInput }) => {
    const selections = await loadDriftSelection(parsedInput.driftIds);

    for (const { link, rows } of selections) {
      await db
        .update(workspaceGroupDrift)
        .set({
          status: parsedInput.ignored ? "ignored" : "open",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workspaceGroupDrift.linkId, link.id),
            inArray(
              workspaceGroupDrift.id,
              rows.map((row) => row.id),
            ),
          ),
        );
    }

    return { success: true, ignored: parsedInput.ignored };
  });
