import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { EMPTY_PAYMENT_SCOPE } from "@/lib/payments/scope";
import { db, pool } from "@/server/db";
import {
  categoryAdminAssignments,
  events,
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import { getPaymentScope } from "@/server/queries/access";
import { listPaymentsForOrg } from "@/server/queries/payments";

/**
 * Payment scope (CONTEXT.md) through the capability door, and the list query
 * honouring it. Pins the case that used to leak: a scoped admin with no
 * group-admin row got `memberIds: []`, which the list read as "no filter".
 *
 * Needs a database. Creates its own organization and deletes it afterwards.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("payment scope", () => {
  let orgId: string;
  let categoryId: string;
  let ledGroupId: string;
  let otherGroupId: string;
  let leaderId: string;
  let categoryAdminId: string;
  let ledMemberId: string;
  let otherMemberId: string;
  let ledEventId: string;
  let orgEventId: string;

  const paymentIds: Record<string, string> = {};

  function scopedAccess(memberId: string) {
    return {
      adminAccessLevel: "scoped" as const,
      capabilities: { canManagePayments: true } as never,
      organization: { id: orgId } as never,
      member: { id: memberId } as never,
    };
  }

  async function makeMember(firstName: string) {
    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        firstName,
        lastName: "Testcase",
        email: `${firstName.toLowerCase()}-${Date.now()}@example.test`,
        status: "active",
      })
      .returning({ id: tenantMembers.id });
    return member.id;
  }

  async function makePayment(
    key: string,
    values: { memberId: string | null; eventId: string | null },
  ) {
    const [row] = await db
      .insert(memberPayments)
      .values({
        orgId,
        type: values.eventId ? "event" : "membership_fee",
        memberId: values.memberId,
        eventId: values.eventId,
        amount: 10_000,
        currency: "CZK",
        periodLabel: key,
        periodKey: values.eventId ? `event:${values.eventId}` : key,
        dueAt: new Date(),
      })
      .returning({ id: memberPayments.id });
    paymentIds[key] = row.id;
  }

  beforeAll(async () => {
    const suffix = Date.now();
    const [org] = await db
      .insert(organizations)
      .values({ name: "Payment Scope Test Org", slug: `payment-scope-${suffix}` })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [category] = await db
      .insert(groupCategories)
      .values({ orgId, name: "Sections", slug: "sections" })
      .returning({ id: groupCategories.id });
    categoryId = category.id;

    const [led] = await db
      .insert(groups)
      .values({ orgId, categoryId, name: "Led", slug: "led" })
      .returning({ id: groups.id });
    ledGroupId = led.id;
    const [other] = await db
      .insert(groups)
      .values({ orgId, categoryId, name: "Other", slug: "other" })
      .returning({ id: groups.id });
    otherGroupId = other.id;

    leaderId = await makeMember("Leader");
    categoryAdminId = await makeMember("Catadmin");
    ledMemberId = await makeMember("Ledmember");
    otherMemberId = await makeMember("Othermember");

    await db.insert(groupMemberships).values([
      { orgId, groupId: ledGroupId, memberId: leaderId, role: "group_admin", status: "active" },
      { orgId, groupId: ledGroupId, memberId: ledMemberId, role: "member", status: "active" },
      { orgId, groupId: otherGroupId, memberId: otherMemberId, role: "member", status: "active" },
    ]);
    await db.insert(categoryAdminAssignments).values({ orgId, categoryId, memberId: categoryAdminId });

    const [ledEvent] = await db
      .insert(events)
      .values({
        orgId,
        slug: `led-trip-${suffix}`,
        title: "Led trip",
        ownerType: "group",
        ownerGroupId: ledGroupId,
        visibility: "targeted",
        status: "published",
        startsAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: events.id });
    ledEventId = ledEvent.id;
    const [orgEvent] = await db
      .insert(events)
      .values({
        orgId,
        slug: `org-gala-${suffix}`,
        title: "Org gala",
        ownerType: "organization",
        visibility: "targeted",
        status: "published",
        startsAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: events.id });
    orgEventId = orgEvent.id;

    await makePayment("fee-led", { memberId: ledMemberId, eventId: null });
    await makePayment("fee-other", { memberId: otherMemberId, eventId: null });
    await makePayment("led-event-guest", { memberId: null, eventId: ledEventId });
    await makePayment("org-event-led-member", { memberId: ledMemberId, eventId: orgEventId });
    await makePayment("org-event-other-member", { memberId: otherMemberId, eventId: orgEventId });
  });

  afterAll(async () => {
    if (orgId) {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    await pool.end();
  });

  async function listedKeys(scope: Parameters<typeof listPaymentsForOrg>[1]) {
    const rows = await listPaymentsForOrg(orgId, scope);
    return rows.map((row) => row.periodLabel).sort();
  }

  async function actableKeys(scope: Parameters<typeof listPaymentsForOrg>[1]) {
    const rows = await listPaymentsForOrg(orgId, scope);
    return rows.filter((row) => row.canAct).map((row) => row.periodLabel).sort();
  }

  it("a group leader reaches their members' fees and their event, plus their members' rows elsewhere", async () => {
    const scope = await getPaymentScope(scopedAccess(leaderId));
    if (scope === null || scope === "full") throw new Error("expected a scoped allowlist");
    expect([...scope.memberIds].sort()).toEqual([ledMemberId, leaderId].sort());
    expect(scope.eventIds).toEqual([ledEventId]);
    expect(await listedKeys({ scope })).toEqual([
      "fee-led",
      "led-event-guest",
      "org-event-led-member",
    ]);
    // Their member's row on the org event is in view but read-only.
    expect(await actableKeys({ scope })).toEqual(["fee-led", "led-event-guest"]);
  });

  it("a category admin with no group-admin row sees only events their category's groups own", async () => {
    const scope = await getPaymentScope(scopedAccess(categoryAdminId));
    expect(scope).toEqual({ memberIds: [], eventIds: [] });
    // The old read path turned this into "every payment in the org".
    expect(await listedKeys({ scope: EMPTY_PAYMENT_SCOPE })).toEqual([]);
  });

  it("no capability means no scope", async () => {
    const access = { ...scopedAccess(leaderId), capabilities: { canManagePayments: false } as never };
    expect(await getPaymentScope(access)).toBeNull();
  });

  it("full access is unrestricted", async () => {
    const access = { ...scopedAccess(leaderId), adminAccessLevel: "full" as const };
    expect(await getPaymentScope(access)).toBe("full");
    expect(await listedKeys({ scope: "full" })).toHaveLength(5);
  });
});
