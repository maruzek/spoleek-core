import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  membershipReportGroups,
  membershipReportMembers,
  membershipReports,
  organizations,
  tenantMembers,
  type MembershipStatus,
} from "@/server/db/schema";
import {
  getBoardReportView,
  getGroupReportView,
  getReportHistory,
} from "@/server/queries/membership-reports";

/**
 * The year-over-year comparison, against real rows.
 *
 * The classification is unit-tested on its own. What needs a database is that
 * the two rosters are matched snapshot to snapshot across reports — never
 * through `group_memberships`, which has no history — and that a member who
 * changed region is found on the other group's list rather than counted as a
 * loss.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("year-over-year comparison", () => {
  let orgId: string;
  let northId: string;
  let southId: string;
  let eastId: string;
  let lastYearId: string;
  let thisYearId: string;

  const members: Record<string, string> = {};

  async function makeMember(
    name: string,
    groupId: string,
    status: MembershipStatus = "active",
  ) {
    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        firstName: name,
        lastName: "Testcase",
        email: `${name.toLowerCase()}@example.test`,
        status,
      })
      .returning({ id: tenantMembers.id });

    await db
      .insert(groupMemberships)
      .values({ orgId, groupId, memberId: member.id });

    members[name] = member.id;
    return member.id;
  }

  async function makeReport(periodLabel: string, groupIds: string[]) {
    const [report] = await db
      .insert(membershipReports)
      .values({
        orgId,
        periodLabel,
        periodStart: new Date(Date.UTC(Number(periodLabel), 0, 1)),
        periodEnd: new Date(Date.UTC(Number(periodLabel), 11, 31)),
        currency: "CZK",
        status: "open",
      })
      .returning({ id: membershipReports.id });

    for (const groupId of groupIds) {
      const [group] = await db
        .select({ name: groups.name })
        .from(groups)
        .where(eq(groups.id, groupId));

      await db.insert(membershipReportGroups).values({
        orgId,
        reportId: report.id,
        groupId,
        groupName: group.name,
      });
    }

    return report.id;
  }

  async function addToRoster(reportId: string, groupId: string, names: string[]) {
    const [reportGroup] = await db
      .select({ id: membershipReportGroups.id })
      .from(membershipReportGroups)
      .where(
        and(
          eq(membershipReportGroups.reportId, reportId),
          eq(membershipReportGroups.groupId, groupId),
        ),
      );

    for (const name of names) {
      await db.insert(membershipReportMembers).values({
        orgId,
        reportGroupId: reportGroup.id,
        memberId: members[name],
        firstName: name,
        lastName: "Testcase",
        email: `${name.toLowerCase()}@example.test`,
        confirmationBasis: "paid",
        feeAmountCents: 25_000,
        currency: "CZK",
      });
    }

    await db
      .update(membershipReportGroups)
      .set({ memberCount: names.length, paidCount: names.length })
      .where(eq(membershipReportGroups.id, reportGroup.id));
  }

  beforeAll(async () => {
    const suffix = Date.now();

    const [org] = await db
      .insert(organizations)
      .values({
        name: "Comparison Test Org",
        slug: `comparison-test-${suffix}`,
        membershipReportEnabled: true,
        membershipFeeCurrency: "CZK",
      })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [category] = await db
      .insert(groupCategories)
      .values({
        orgId,
        name: "Regions",
        slug: "regions",
        managesMembershipFees: true,
      })
      .returning({ id: groupCategories.id });

    const [north] = await db
      .insert(groups)
      .values({ orgId, categoryId: category.id, name: "North", slug: "north" })
      .returning({ id: groups.id });
    northId = north.id;

    const [south] = await db
      .insert(groups)
      .values({ orgId, categoryId: category.id, name: "South", slug: "south" })
      .returning({ id: groups.id });
    southId = south.id;

    // Added part-way through the history, so it has no 2025 row at all.
    const [east] = await db
      .insert(groups)
      .values({ orgId, categoryId: category.id, name: "East", slug: "east" })
      .returning({ id: groups.id });
    eastId = east.id;

    // North's cast: one who stays, one who transfers to South, one who leaves
    // the organization, one who simply has not paid, and one who is new.
    await makeMember("Stays", northId);
    await makeMember("Transfers", northId);
    await makeMember("Departed", northId, "archived");
    await makeMember("Unpaid", northId);
    await makeMember("Fresh", northId);
    await makeMember("Eastern", eastId);

    lastYearId = await makeReport("2025", [northId, southId]);
    await addToRoster(lastYearId, northId, [
      "Stays",
      "Transfers",
      "Departed",
      "Unpaid",
    ]);

    thisYearId = await makeReport("2026", [northId, southId, eastId]);
    await addToRoster(thisYearId, northId, ["Stays", "Fresh"]);
    await addToRoster(thisYearId, southId, ["Transfers"]);
    await addToRoster(thisYearId, eastId, ["Eastern"]);
  });

  afterAll(async () => {
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
    await pool.end();
  });

  it("compares a group with its own roster from the previous report", async () => {
    const view = await getGroupReportView(orgId, northId, thisYearId);
    const comparison = view!.comparison!;

    expect(comparison.previousPeriodLabel).toBe("2025");
    expect(comparison.previousMemberCount).toBe(4);
    expect(comparison.returningCount).toBe(1);
    expect(comparison.newMembers.map((m) => m.firstName)).toEqual(["Fresh"]);
  });

  it("explains each member who is not on this year's list", async () => {
    const view = await getGroupReportView(orgId, northId, thisYearId);
    const byName = new Map(
      view!.comparison!.missingMembers.map((member) => [
        member.firstName,
        member,
      ]),
    );

    expect(byName.get("Transfers")).toMatchObject({
      reason: "moved",
      movedTo: "South",
    });
    expect(byName.get("Departed")).toMatchObject({ reason: "left" });
    expect(byName.get("Unpaid")).toMatchObject({ reason: "unpaid" });
    expect(byName.size).toBe(3);
  });

  it("has nothing to compare in a group's first reported year", async () => {
    const view = await getGroupReportView(orgId, northId, lastYearId);
    expect(view!.comparison).toBeNull();
  });

  it("gives the board each group's previous count and its own baseline year", async () => {
    const view = await getBoardReportView(orgId, thisYearId);
    const north = view!.groups.find((group) => group.groupName === "North")!;
    const south = view!.groups.find((group) => group.groupName === "South")!;

    expect(north).toMatchObject({
      memberCount: 2,
      previousMemberCount: 4,
      previousPeriodLabel: "2025",
    });
    // South reported nobody last year, which is a baseline of 0 — not the
    // absence of one.
    expect(south).toMatchObject({ memberCount: 1, previousMemberCount: 0 });
  });

  it("offers no baseline on the earliest report", async () => {
    const view = await getBoardReportView(orgId, lastYearId);
    for (const group of view!.groups) {
      expect(group.previousMemberCount).toBeNull();
      expect(group.previousPeriodLabel).toBeNull();
    }
  });

  it("returns one point per reported year, oldest first", async () => {
    const history = await getReportHistory(orgId);

    expect(history.map((point) => point.periodLabel)).toEqual(["2025", "2026"]);
    expect(history[0].totalMembers).toBe(4);
    expect(history[1].totalMembers).toBe(4);
  });

  it("leaves a group out of a year it did not report, rather than showing zero", async () => {
    // "Did not exist" and "reported nobody" have to look different, or a trend
    // line draws a collapse where a region was simply not there yet.
    const history = await getReportHistory(orgId);
    const names = (index: number) =>
      history[index].byGroup.map((group) => group.groupName);

    expect(names(0)).not.toContain("East");
    expect(names(0)).toContain("South");
    expect(names(1)).toContain("East");
  });
});
