import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  groupWorkspaceLinks,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import {
  activeMembership,
  GroupMembershipError,
  syncManageableGroupMemberships,
  upsertActiveMembership,
} from "@/server/lib/group-membership";
import { syncRegistrationGroupSelections } from "@/server/lib/group-registration";
import { adoptDriftAddress } from "@/server/lib/workspace/adopt-drift";

/**
 * The Group Category selection invariant — one active group per single-select
 * category, at most `maxSelections` per multi-select — is enforced inside
 * `upsertActiveMembership`, so every door that creates a membership gets it
 * for free. This test walks through each door and asserts the second
 * single-select membership is refused at all of them, and that a *switch*
 * (delete then insert in one transaction) still passes.
 *
 * Needs a database. Creates its own organization and deletes it afterwards.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("group category selection invariant", () => {
  let orgId: string;
  let regionsId: string;
  let clubsId: string;
  let north: string;
  let south: string;
  let chess: string;
  let choir: string;
  let drama: string;

  async function makeMember(firstName: string) {
    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        firstName,
        lastName: "Testcase",
        email: `${firstName.toLowerCase()}-${Date.now()}@example.test`,
        workspaceUserEmail: `${firstName.toLowerCase()}-${Date.now()}@workspace.example.test`,
        status: "active",
      })
      .returning({ id: tenantMembers.id, workspaceUserEmail: tenantMembers.workspaceUserEmail });

    return member;
  }

  async function activeGroupIds(memberId: string) {
    const rows = await db
      .select({ groupId: groupMemberships.groupId })
      .from(groupMemberships)
      .where(and(eq(groupMemberships.memberId, memberId), activeMembership()));

    return rows.map((row) => row.groupId).sort();
  }

  async function makeGroup(categoryId: string, name: string) {
    const [group] = await db
      .insert(groups)
      .values({ orgId, categoryId, name, slug: name.toLowerCase(), joinPolicy: "free_join_leave" })
      .returning({ id: groups.id });
    return group.id;
  }

  beforeAll(async () => {
    const suffix = Date.now();

    const [org] = await db
      .insert(organizations)
      .values({ name: "Selection Invariant Test Org", slug: `selection-invariant-${suffix}` })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [regions] = await db
      .insert(groupCategories)
      .values({ orgId, name: "Regions", slug: "regions", selectionMode: "single" })
      .returning({ id: groupCategories.id });
    regionsId = regions.id;

    const [clubs] = await db
      .insert(groupCategories)
      .values({ orgId, name: "Clubs", slug: "clubs", selectionMode: "multiple", maxSelections: 2 })
      .returning({ id: groupCategories.id });
    clubsId = clubs.id;

    north = await makeGroup(regionsId, "North");
    south = await makeGroup(regionsId, "South");
    chess = await makeGroup(clubsId, "Chess");
    choir = await makeGroup(clubsId, "Choir");
    drama = await makeGroup(clubsId, "Drama");
  });

  afterAll(async () => {
    if (orgId) {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    await pool.end();
  });

  it("door 1 · direct assignment (admin assign / group admin) refuses the second region", async () => {
    const { id: memberId } = await makeMember("Direct");

    await upsertActiveMembership(db, { orgId, groupId: north, memberId });
    // Re-assigning the same group never counts against itself.
    await upsertActiveMembership(db, { orgId, groupId: north, memberId, role: "group_admin" });

    await expect(
      upsertActiveMembership(db, { orgId, groupId: south, memberId }),
    ).rejects.toMatchObject({ code: "SINGLE_SELECT_TAKEN", categoryName: "Regions" });

    expect(await activeGroupIds(memberId)).toEqual([north]);
  });

  it("door 1 · multi-select stops at maxSelections", async () => {
    const { id: memberId } = await makeMember("Clubs");

    await upsertActiveMembership(db, { orgId, groupId: chess, memberId });
    await upsertActiveMembership(db, { orgId, groupId: choir, memberId });

    await expect(
      upsertActiveMembership(db, { orgId, groupId: drama, memberId }),
    ).rejects.toMatchObject({ code: "MAX_SELECTIONS_REACHED", maxSelections: 2 });

    expect(await activeGroupIds(memberId)).toEqual([chess, choir].sort());
  });

  it("door 2 · portal join / request approval: a switch inside one transaction passes, a plain add is rolled back", async () => {
    const { id: memberId } = await makeMember("Portal");
    await upsertActiveMembership(db, { orgId, groupId: north, memberId });

    // The join action's `switch` shape: leave the current region, then join.
    await db.transaction(async (tx) => {
      await tx
        .delete(groupMemberships)
        .where(and(eq(groupMemberships.groupId, north), eq(groupMemberships.memberId, memberId)));
      await upsertActiveMembership(tx, { orgId, groupId: south, memberId });
    });
    expect(await activeGroupIds(memberId)).toEqual([south]);

    // The approval shape with no leave: the whole transaction is lost.
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(groupMemberships).values({ orgId, groupId: chess, memberId, status: "active" });
        await upsertActiveMembership(tx, { orgId, groupId: north, memberId });
      }),
    ).rejects.toBeInstanceOf(GroupMembershipError);
    expect(await activeGroupIds(memberId)).toEqual([south]);
  });

  it("door 3 · registration selections: replacing the category's row is a switch, adding beside it is refused", async () => {
    const { id: memberId } = await makeMember("Registrant");
    await upsertActiveMembership(db, { orgId, groupId: north, memberId });

    // Regions is on the join form: its old row is cleared before the insert.
    await db.transaction((tx) =>
      syncRegistrationGroupSelections(tx, {
        orgId,
        memberId,
        registrationCategoryIds: [regionsId],
        selections: [{ categoryId: regionsId, groupId: south }],
      }),
    );
    expect(await activeGroupIds(memberId)).toEqual([south]);

    // Regions is *not* on the form, yet a selection for it arrives.
    await expect(
      db.transaction((tx) =>
        syncRegistrationGroupSelections(tx, {
          orgId,
          memberId,
          registrationCategoryIds: [],
          selections: [{ categoryId: regionsId, groupId: north }],
        }),
      ),
    ).rejects.toBeInstanceOf(GroupMembershipError);
    expect(await activeGroupIds(memberId)).toEqual([south]);
  });

  it("door 4 · member form picker: two regions in one save are refused, one region replaces the other", async () => {
    const { id: memberId } = await makeMember("Edited");
    await upsertActiveMembership(db, { orgId, groupId: north, memberId });

    await expect(
      db.transaction((tx) =>
        syncManageableGroupMemberships({
          tx,
          orgId,
          memberId,
          allowedGroupIds: [north, south],
          nextGroupIds: [north, south],
        }),
      ),
    ).rejects.toBeInstanceOf(GroupMembershipError);
    expect(await activeGroupIds(memberId)).toEqual([north]);

    await db.transaction((tx) =>
      syncManageableGroupMemberships({
        tx,
        orgId,
        memberId,
        allowedGroupIds: [north, south],
        nextGroupIds: [south],
      }),
    );
    expect(await activeGroupIds(memberId)).toEqual([south]);
  });

  it("door 5 · adopting Workspace drift skips a member the category will not take", async () => {
    const member = await makeMember("Adopted");
    await upsertActiveMembership(db, { orgId, groupId: north, memberId: member.id });

    const [link] = await db
      .insert(groupWorkspaceLinks)
      .values({
        orgId,
        groupId: south,
        workspaceGroupId: "south-google-group",
        workspaceGroupEmail: "south@workspace.example.test",
      })
      .returning({ id: groupWorkspaceLinks.id });

    const outcome = await adoptDriftAddress(
      { id: link.id, orgId, groupId: south, workspaceGroupId: "south-google-group", includeExternal: true },
      member.workspaceUserEmail!,
    );

    expect(outcome).toEqual({ status: "skipped", reason: "category_selection_full" });
    expect(await activeGroupIds(member.id)).toEqual([north]);
  });
});
