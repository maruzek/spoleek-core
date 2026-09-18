"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray } from "drizzle-orm";

import {
  GROUP_ANNOUNCEMENT_MAX_LENGTH,
  saveGroupResourcesSchema,
  setHideFromGroupRostersSchema,
  updateGroupAnnouncementSchema,
} from "@/lib/groups";
import { authActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { groupResources, groups, tenantMembers } from "@/server/db/schema";
import { isPolicyHtmlEmpty, sanitizePolicyHtml } from "@/server/lib/policy-html";
import {
  requireCurrentMemberAccess,
  requireGroupManagementAccess,
} from "@/server/queries/access";

/**
 * Leader-curated content on a group's portal page, and the member's roster
 * opt-out. Both editors are reachable from the portal page itself and from
 * the admin group detail, so the revalidation covers both.
 */

async function loadGroupForPage(orgId: string, groupId: string) {
  const [group] = await db
    .select({ id: groups.id, slug: groups.slug, categoryId: groups.categoryId })
    .from(groups)
    .where(and(eq(groups.orgId, orgId), eq(groups.id, groupId)))
    .limit(1);

  if (!group) {
    throw new Error("The group could not be found.");
  }

  return group;
}

function revalidateGroupPage(group: { slug: string; categoryId: string; id: string }) {
  revalidatePath("/portal/groups");
  revalidatePath(`/portal/groups/${group.slug}`);
  revalidatePath("/portal");
  revalidatePath(`/admin/groups/${group.categoryId}/${group.id}`);
}

export const updateGroupAnnouncementAction = authActionClient
  .metadata({ actionName: "updateGroupAnnouncement" })
  .inputSchema(updateGroupAnnouncementSchema)
  .action(async ({ parsedInput }) => {
    const context = await requireGroupManagementAccess(parsedInput.groupId);
    const orgId = context.organization.id;
    const group = await loadGroupForPage(orgId, parsedInput.groupId);

    // The editor is trusted no more than a pasted document: whatever arrives
    // is sanitized here, and the limit is checked on the result.
    const html = sanitizePolicyHtml(parsedInput.html);
    if (html.length > GROUP_ANNOUNCEMENT_MAX_LENGTH) {
      throw new Error("The announcement is too long.");
    }

    const empty = isPolicyHtmlEmpty(html);
    await db
      .update(groups)
      .set(
        empty
          ? {
              announcement: null,
              announcementUpdatedAt: null,
              announcementUpdatedByMemberId: null,
              updatedAt: new Date(),
            }
          : {
              announcement: html,
              announcementUpdatedAt: new Date(),
              announcementUpdatedByMemberId: context.member?.id ?? null,
              updatedAt: new Date(),
            },
      )
      .where(and(eq(groups.orgId, orgId), eq(groups.id, group.id)));

    revalidateGroupPage(group);

    return { success: true, cleared: empty };
  });

export const saveGroupResourcesAction = authActionClient
  .metadata({ actionName: "saveGroupResources" })
  .inputSchema(saveGroupResourcesSchema)
  .action(async ({ parsedInput }) => {
    const context = await requireGroupManagementAccess(parsedInput.groupId);
    const orgId = context.organization.id;
    const group = await loadGroupForPage(orgId, parsedInput.groupId);

    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: groupResources.id })
        .from(groupResources)
        .where(and(eq(groupResources.orgId, orgId), eq(groupResources.groupId, group.id)));
      const existingIds = new Set(existing.map((row) => row.id));

      // An id the client sends must be one of this group's rows: anything
      // else is stale or forged, and updating it would move another group's
      // link into this one.
      const keptIds = parsedInput.resources.flatMap((r) => (r.id ? [r.id] : []));
      for (const id of keptIds) {
        if (!existingIds.has(id)) {
          throw new Error("One of the links no longer exists. Reload and try again.");
        }
      }

      if (existingIds.size > 0) {
        await tx
          .delete(groupResources)
          .where(
            and(
              eq(groupResources.orgId, orgId),
              eq(groupResources.groupId, group.id),
              keptIds.length > 0
                ? notInArray(groupResources.id, keptIds)
                : inArray(groupResources.id, [...existingIds]),
            ),
          );
      }

      const now = new Date();
      for (const [index, resource] of parsedInput.resources.entries()) {
        if (resource.id) {
          await tx
            .update(groupResources)
            .set({ label: resource.label, url: resource.url, sortOrder: index, updatedAt: now })
            .where(and(eq(groupResources.orgId, orgId), eq(groupResources.id, resource.id)));
        } else {
          await tx.insert(groupResources).values({
            orgId,
            groupId: group.id,
            label: resource.label,
            url: resource.url,
            sortOrder: index,
          });
        }
      }
    });

    revalidateGroupPage(group);

    return { success: true };
  });

export const setHideFromGroupRostersAction = authActionClient
  .metadata({ actionName: "setHideFromGroupRosters" })
  .inputSchema(setHideFromGroupRostersSchema)
  .action(async ({ parsedInput }) => {
    const { organization, member } = await requireCurrentMemberAccess();

    await db
      .update(tenantMembers)
      .set({ hideFromGroupRosters: parsedInput.hidden, updatedAt: new Date() })
      .where(and(eq(tenantMembers.orgId, organization.id), eq(tenantMembers.id, member.id)));

    revalidatePath("/portal/profile");
    revalidatePath("/portal/groups", "layout");

    return { success: true };
  });
