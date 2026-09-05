import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  membershipReportGroups,
  membershipReportMembers,
  membershipReports,
  organizations,
  tenantMembers,
  users,
} from "@/server/db/schema";
import {
  openMembershipReport,
  syncReportMemberForPayment,
} from "@/server/lib/membership-report";

/**
 * Invariant 1, end to end: a member confirmed against a roster that is already
 * submitted must land as a pending addition, through *every* write path.
 *
 * This is the one rule the unit tests cannot prove. `isReportGroupFrozen` says
 * what frozen means; only the real writes say whether they ask. The freeze
 * bypass that shipped and had to be fixed late was in the backfill, not in the
 * comparison.
 *
 * Needs a database. Creates its own organization and deletes it afterwards —
 * every table below hangs off `org_id` with `ON DELETE CASCADE`, so the
 * teardown is one row.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

const PERIOD = String(new Date().getUTCFullYear());

suite("the freeze, through both write paths", () => {
  let orgId: string;
  let groupId: string;
  let categoryId: string;
  let userId: string;

  async function makeMember(firstName: string) {
    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        firstName,
        lastName: "Testcase",
        email: `${firstName.toLowerCase()}@example.test`,
        status: "active",
      })
      .returning({ id: tenantMembers.id });

    await db
      .insert(groupMemberships)
      .values({ orgId, groupId, memberId: member.id });

    return member.id;
  }

  async function makePaidPayment(memberId: string) {
    const [payment] = await db
      .insert(memberPayments)
      .values({
        orgId,
        memberId,
        amount: 25_000,
        currency: "CZK",
        periodLabel: PERIOD,
        periodKey: `${PERIOD}:org:${memberId}`,
        dueAt: new Date(),
        status: "paid",
        paidAt: new Date(),
      })
      .returning({ id: memberPayments.id });

    return payment.id;
  }

  async function rosterRow(memberId: string) {
    const [row] = await db
      .select({
        pendingAddition: membershipReportMembers.pendingAddition,
        basis: membershipReportMembers.confirmationBasis,
      })
      .from(membershipReportMembers)
      .where(eq(membershipReportMembers.memberId, memberId))
      .limit(1);

    return row ?? null;
  }

  beforeAll(async () => {
    const suffix = Date.now();

    const [org] = await db
      .insert(organizations)
      .values({
        name: "Freeze Test Org",
        slug: `freeze-test-${suffix}`,
        membershipReportEnabled: true,
        membershipFeeEnabled: true,
        membershipFeeAmount: 25_000,
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
    categoryId = category.id;

    const [group] = await db
      .insert(groups)
      .values({ orgId, categoryId, name: "North", slug: "north" })
      .returning({ id: groups.id });
    groupId = group.id;

    const [user] = await db
      .insert(users)
      .values({
        id: `freeze-test-${suffix}`,
        name: "Freeze Test",
        email: `freeze-test-${suffix}@example.test`,
      })
      .returning({ id: users.id });
    userId = user.id;
  });

  afterAll(async () => {
    if (orgId) {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }
    await pool.end();
  });

  it("records a late payment as a pending addition, leaving the counts alone", async () => {
    const early = await makeMember("Early");
    await makePaidPayment(early);

    await openMembershipReport({ orgId, userId });

    const [reportGroup] = await db
      .select()
      .from(membershipReportGroups)
      .where(eq(membershipReportGroups.groupId, groupId));

    expect(reportGroup.memberCount).toBe(1);
    expect(await rosterRow(early)).toMatchObject({
      pendingAddition: false,
      basis: "paid",
    });

    // The group signs off.
    await db
      .update(membershipReportGroups)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(membershipReportGroups.id, reportGroup.id));

    // Write path 1: a payment settled after the submission.
    const late = await makeMember("Late");
    const latePayment = await makePaidPayment(late);
    await syncReportMemberForPayment(latePayment);

    expect(await rosterRow(late)).toMatchObject({ pendingAddition: true });

    const [afterSync] = await db
      .select()
      .from(membershipReportGroups)
      .where(eq(membershipReportGroups.id, reportGroup.id));
    expect(afterSync.memberCount).toBe(1);
    expect(afterSync.status).toBe("submitted");
  });

  it("holds a backfilled member out of a submitted roster too", async () => {
    // Write path 2: "Refresh from payments" over a roster already signed off.
    // This is where the bypass was, and the one the unit tests cannot see.
    const missed = await makeMember("Missed");
    await makePaidPayment(missed);

    await openMembershipReport({ orgId, userId });

    expect(await rosterRow(missed)).toMatchObject({ pendingAddition: true });

    const [reportGroup] = await db
      .select()
      .from(membershipReportGroups)
      .where(eq(membershipReportGroups.groupId, groupId));

    expect(reportGroup.memberCount).toBe(1);
    expect(reportGroup.status).toBe("submitted");
  });

  it("snapshots the organization's currency onto the report", async () => {
    const [report] = await db
      .select()
      .from(membershipReports)
      .where(eq(membershipReports.orgId, orgId));

    expect(report.currency).toBe("CZK");
    expect(report.periodLabel).toBe(PERIOD);
  });
});
