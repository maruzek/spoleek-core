import { and, eq, like } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  tenantMembers,
} from "@/server/db/schema";

/** Every fixture row carries this slug / email prefix so a reset removes exactly them. */
export const DEMO_GROUP_SLUG_PREFIX = "demo-";
const DEMO_EMAIL_DOMAIN = "@groups.demo.test";

/**
 * One category with a group per join policy, plus the people needed to make
 * every portal card state reachable from a fresh org:
 *
 * - "Demo sections" — multi-select, shows admin-only groups to non-members.
 *   - Climbing: `free_join_leave`, led by Dana → the portal offers **Join**.
 *   - Hiking: `request_to_join`, led by Dana → **Ask to join**; carries one
 *     pending request (Eva) and one declined request (Filip, blocked).
 *   - Board: `admin_only` → **Ask a leader**, with Dana's mailto.
 *
 * Members are shadow records (no login) so the seed never touches auth; sign
 * in as your own member to see the portal side, or open Hiking's Requests
 * tab as an admin to decide Eva's request.
 */
export async function seedDemoGroups(orgId: string) {
  const now = Date.now();
  const day = 86_400_000;

  const [category] = await db
    .insert(groupCategories)
    .values({
      orgId,
      name: "Demo sections",
      slug: `${DEMO_GROUP_SLUG_PREFIX}sections`,
      description: "Sports sections members pick for themselves.",
      selectionMode: "multiple",
      maxSelections: 2,
      showGroupsToNonMembers: true,
      groupAdminsManageMembers: true,
      defaultJoinPolicy: "free_join_leave",
    })
    .returning({ id: groupCategories.id });

  const [climbing, hiking, board] = await db
    .insert(groups)
    .values([
      {
        orgId,
        categoryId: category!.id,
        name: "Demo climbing",
        slug: `${DEMO_GROUP_SLUG_PREFIX}climbing`,
        description: "Indoor wall on Tuesdays, rock on weekends.",
        joinPolicy: "free_join_leave",
        sortOrder: 0,
      },
      {
        orgId,
        categoryId: category!.id,
        name: "Demo hiking",
        slug: `${DEMO_GROUP_SLUG_PREFIX}hiking`,
        description: "One long walk a month. Leaders approve who joins.",
        joinPolicy: "request_to_join",
        sortOrder: 1,
      },
      {
        orgId,
        categoryId: category!.id,
        name: "Demo board",
        slug: `${DEMO_GROUP_SLUG_PREFIX}board`,
        description: "The section committee. Appointed, not joined.",
        joinPolicy: "admin_only",
        sortOrder: 2,
      },
    ])
    .returning({ id: groups.id });

  const [dana, eva, filip] = await db
    .insert(tenantMembers)
    .values([
      { orgId, firstName: "Dana", lastName: "Leader", email: `dana${DEMO_EMAIL_DOMAIN}`, status: "active" },
      { orgId, firstName: "Eva", lastName: "Asking", email: `eva${DEMO_EMAIL_DOMAIN}`, status: "active" },
      { orgId, firstName: "Filip", lastName: "Declined", email: `filip${DEMO_EMAIL_DOMAIN}`, status: "active" },
    ])
    .returning({ id: tenantMembers.id });

  await db.insert(groupMemberships).values([
    { orgId, groupId: climbing!.id, memberId: dana!.id, role: "group_admin" },
    { orgId, groupId: hiking!.id, memberId: dana!.id, role: "group_admin" },
    { orgId, groupId: board!.id, memberId: dana!.id, role: "group_admin" },
    { orgId, groupId: climbing!.id, memberId: eva!.id },
    {
      orgId,
      groupId: hiking!.id,
      memberId: eva!.id,
      status: "pending",
      requestMessage: "I did the Krkonoše crossing last year and would love to join the monthly walks.",
      requestedAt: new Date(now - 2 * day),
    },
    {
      orgId,
      groupId: hiking!.id,
      memberId: filip!.id,
      status: "declined",
      requestMessage: "Can I come along?",
      requestedAt: new Date(now - 20 * day),
      decidedAt: new Date(now - 18 * day),
      decidedByMemberId: dana!.id,
      declineReason: "The group is full this season — ask again in spring.",
      requestsBlocked: true,
    },
  ]);

  return {
    categoryId: category!.id,
    groupIds: { climbing: climbing!.id, hiking: hiking!.id, board: board!.id },
    memberIds: { dana: dana!.id, eva: eva!.id, filip: filip!.id },
  };
}

/** Removes the demo category (groups and memberships cascade) and the demo members. */
export async function resetDemoGroups(orgId: string) {
  const [categories, members] = await Promise.all([
    db
      .delete(groupCategories)
      .where(and(eq(groupCategories.orgId, orgId), like(groupCategories.slug, `${DEMO_GROUP_SLUG_PREFIX}%`)))
      .returning({ slug: groupCategories.slug }),
    db
      .delete(tenantMembers)
      .where(and(eq(tenantMembers.orgId, orgId), like(tenantMembers.email, `%${DEMO_EMAIL_DOMAIN}`)))
      .returning({ email: tenantMembers.email }),
  ]);

  return { categories: categories.length, members: members.length };
}
