import { and, eq, like } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groupResources,
  groups,
  organizations,
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
 * For the group page: Climbing is open to all members, carries a notice and
 * three links; the org shows rosters; Filip has opted out of them. Reset
 * turns the org switch back off.
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
        pageVisibility: "all_members",
        announcement:
          "<h2>Autumn season</h2><p>The wall reopens on <strong>1 October</strong>. Bring your own harness; club ropes are checked and back in the locker.</p><ul><li>Tuesdays 18:00 — indoor</li><li>Weekends — rock, weather permitting</li></ul>",
        announcementUpdatedAt: new Date(now - 3 * day),
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
      {
        orgId,
        firstName: "Filip",
        lastName: "Declined",
        email: `filip${DEMO_EMAIL_DOMAIN}`,
        status: "active",
        hideFromGroupRosters: true,
      },
    ])
    .returning({ id: tenantMembers.id });

  // The announcement author is Dana; the FK needs her row first.
  await db
    .update(groups)
    .set({ announcementUpdatedByMemberId: dana!.id })
    .where(eq(groups.id, climbing!.id));

  await db.insert(groupResources).values([
    { orgId, groupId: climbing!.id, label: "Team chat", url: "https://chat.example.test/climbing", sortOrder: 0 },
    { orgId, groupId: climbing!.id, label: "Route log (shared sheet)", url: "https://docs.example.test/routes", sortOrder: 1 },
    { orgId, groupId: climbing!.id, label: "Write to the wall", url: "mailto:wall@example.test", sortOrder: 2 },
  ]);

  await db.update(organizations).set({ showGroupRosters: true }).where(eq(organizations.id, orgId));

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

/** Removes the demo category (groups, memberships and links cascade) and the demo members; turns rosters back off. */
export async function resetDemoGroups(orgId: string) {
  await db.update(organizations).set({ showGroupRosters: false }).where(eq(organizations.id, orgId));
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
