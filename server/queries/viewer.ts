import { cache } from "react";
import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";

import { EMPTY_VIEWER_SCOPE, type Viewer, type ViewerScope } from "@/lib/access/viewer";
import { db } from "@/server/db";
import {
  categoryAdminAssignments,
  groupCategories,
  groupMemberships,
  groups,
  tenantMembers,
  users,
} from "@/server/db/schema";
import { activeMembership } from "@/server/lib/group-membership";
import { getAppOrganization } from "@/server/queries/app";
import { getViewerSession, requireViewerSession } from "@/server/queries/auth";

/**
 * Resolves the Viewer (CONTEXT.md) for a user id. Memoised for the request,
 * so a layout, a page and every guard they call share one resolution. `null`
 * when the user row is gone or no organization exists yet (first-run setup).
 */
export const loadViewer = cache(async (userId: string): Promise<Viewer | null> => {
  const organization = await getAppOrganization();
  if (!organization) return null;

  const [[user], [member]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        systemRole: users.systemRole,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select()
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.orgId, organization.id),
          eq(tenantMembers.userId, userId),
          ne(tenantMembers.status, "deleted"),
        ),
      )
      .limit(1),
  ]);
  if (!user) return null;

  const scope =
    member?.status === "active"
      ? await loadViewerScope(organization.id, member.id)
      : EMPTY_VIEWER_SCOPE;

  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null },
    systemRole: user.systemRole,
    organization,
    member: member ?? null,
    scope,
  };
});

/** The category and group admin assignments the scoped rules read. */
export async function loadViewerScope(orgId: string, memberId: string): Promise<ViewerScope> {
  const [categoryRows, groupRows] = await Promise.all([
    db
      .select({ categoryId: categoryAdminAssignments.categoryId })
      .from(categoryAdminAssignments)
      .where(
        and(
          eq(categoryAdminAssignments.orgId, orgId),
          eq(categoryAdminAssignments.memberId, memberId),
        ),
      ),
    db
      .select({
        id: groups.id,
        categoryId: groups.categoryId,
        groupActive: groups.isActive,
        categoryActive: groupCategories.isActive,
        groupAdminsManageMembers: groupCategories.groupAdminsManageMembers,
      })
      .from(groupMemberships)
      .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
      .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
      .where(
        and(
          eq(groupMemberships.orgId, orgId),
          activeMembership(),
          eq(groupMemberships.memberId, memberId),
          eq(groupMemberships.role, "group_admin"),
        ),
      ),
  ]);

  return {
    categoryIds: categoryRows.map((row) => row.categoryId),
    groups: groupRows.map((row) => ({
      id: row.id,
      categoryId: row.categoryId,
      managesMembers: row.groupActive && row.categoryActive && row.groupAdminsManageMembers,
    })),
  };
}

/** The signed-in Viewer, or `null` when there is no session or no organization. */
export async function getViewer(): Promise<Viewer | null> {
  const session = await getViewerSession();
  if (!session) return null;
  return loadViewer(session.user.id);
}

/** Page entry point: signed out goes to `/`, no organization goes to `/setup`. */
export async function requireViewer(): Promise<Viewer> {
  const session = await requireViewerSession();
  const viewer = await loadViewer(session.user.id);
  if (!viewer) redirect("/setup");
  return viewer;
}
