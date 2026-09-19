import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { resolveEligibleMemberIds } from "@/lib/events/eligibility";
import { db, pool } from "@/server/db";
import {
  eventAudience,
  events,
  groupCategories,
  groupMemberships,
  groups,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import {
  isEligible,
  listEligibleEventIds,
  loadAudienceSnapshot,
  resolveAudiences,
} from "@/server/queries/event-eligibility";
import { getEventRecipients, listEventsForViewer } from "@/server/queries/events";

/**
 * Event eligibility (CONTEXT.md): the SQL one-member path and the snapshot
 * many-member path, both pinned to the pure resolver on a seeded org, and
 * the query budgets that motivated the module — the portal agenda and the
 * recipient lists do not grow with the number of events or filters.
 *
 * Needs a database. Creates its own organization and deletes it afterwards.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("event eligibility", () => {
  let orgId: string;
  const groupIds: Record<string, string> = {};
  const categoryIds: Record<string, string> = {};
  const memberIds: Record<string, string> = {};
  const eventIds: Record<string, string> = {};

  /** Fixture: scouts { g1, g2 }, parents { g3 }; m5 is suspended, m6 has no group, m7 only asked to join g1. */
  const expected: Record<string, string[]> = {
    byGroup: ["m1", "m2"],
    byCategory: ["m1", "m2", "m3"],
    byMember: ["m6"],
    mixed: ["m1", "m2", "m4", "m6"],
    noRules: [],
    org: [],
  };

  const names = (ids: Iterable<string>) =>
    [...ids].map((id) => Object.keys(memberIds).find((k) => memberIds[k] === id) ?? id).sort();

  async function makeEvent(key: string, suffix: number, visibility: "targeted" | "org") {
    const [row] = await db
      .insert(events)
      .values({
        orgId,
        slug: `${key}-${suffix}`,
        title: key,
        ownerType: "organization",
        visibility,
        status: "published",
        startsAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: events.id });
    eventIds[key] = row.id;
    return row.id;
  }

  beforeAll(async () => {
    const suffix = Date.now();
    const [org] = await db
      .insert(organizations)
      .values({ name: "Eligibility Test Org", slug: `eligibility-${suffix}` })
      .returning({ id: organizations.id });
    orgId = org.id;

    for (const name of ["scouts", "parents"]) {
      const [row] = await db
        .insert(groupCategories)
        .values({ orgId, name, slug: name })
        .returning({ id: groupCategories.id });
      categoryIds[name] = row.id;
    }
    for (const [name, category] of [["g1", "scouts"], ["g2", "scouts"], ["g3", "parents"]] as const) {
      const [row] = await db
        .insert(groups)
        .values({ orgId, categoryId: categoryIds[category], name, slug: name })
        .returning({ id: groups.id });
      groupIds[name] = row.id;
    }
    for (const name of ["m1", "m2", "m3", "m4", "m5", "m6", "m7"]) {
      const [row] = await db
        .insert(tenantMembers)
        .values({
          orgId,
          firstName: name,
          lastName: "Testcase",
          email: `${name}-${suffix}@example.test`,
          status: name === "m5" ? "suspended" : "active",
          userId: null,
        })
        .returning({ id: tenantMembers.id });
      memberIds[name] = row.id;
    }
    await db.insert(groupMemberships).values([
      { orgId, groupId: groupIds.g1, memberId: memberIds.m1, role: "group_admin", status: "active" },
      { orgId, groupId: groupIds.g1, memberId: memberIds.m2, role: "member", status: "active" },
      { orgId, groupId: groupIds.g2, memberId: memberIds.m3, role: "member", status: "active" },
      { orgId, groupId: groupIds.g2, memberId: memberIds.m5, role: "member", status: "active" },
      { orgId, groupId: groupIds.g3, memberId: memberIds.m4, role: "member", status: "active" },
      { orgId, groupId: groupIds.g1, memberId: memberIds.m7, role: "member", status: "pending" },
    ]);

    await makeEvent("byGroup", suffix, "targeted");
    await makeEvent("byCategory", suffix, "targeted");
    await makeEvent("byMember", suffix, "targeted");
    await makeEvent("mixed", suffix, "targeted");
    await makeEvent("noRules", suffix, "targeted");
    await makeEvent("org", suffix, "org");

    await db.insert(eventAudience).values([
      { orgId, eventId: eventIds.byGroup, kind: "group", groupId: groupIds.g1 },
      { orgId, eventId: eventIds.byCategory, kind: "category", categoryId: categoryIds.scouts },
      { orgId, eventId: eventIds.byMember, kind: "member", memberId: memberIds.m6 },
      { orgId, eventId: eventIds.byMember, kind: "member", memberId: memberIds.m5 },
      { orgId, eventId: eventIds.mixed, kind: "group", groupId: groupIds.g1 },
      { orgId, eventId: eventIds.mixed, kind: "group", groupId: groupIds.g3 },
      { orgId, eventId: eventIds.mixed, kind: "member", memberId: memberIds.m6 },
      { orgId, eventId: eventIds.mixed, kind: "external", externalEmail: "guest@example.test" },
    ]);
  });

  afterAll(async () => {
    if (orgId) {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    await pool.end();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("the snapshot path reaches exactly the fixture's members", async () => {
    const audiences = await resolveAudiences(orgId, Object.values(eventIds));
    for (const [key, members] of Object.entries(expected)) {
      expect(names(audiences.get(eventIds[key]) ?? []), key).toEqual(members);
    }
  });

  it("the SQL path agrees with the pure resolver for every member and event", async () => {
    const snapshot = await loadAudienceSnapshot(orgId);
    const rules = await db
      .select()
      .from(eventAudience)
      .where(eq(eventAudience.orgId, orgId));
    const targeted = Object.entries(eventIds)
      .filter(([key]) => key !== "org")
      .map(([, id]) => ({ id, visibility: "targeted" as const }));

    for (const [memberName, memberId] of Object.entries(memberIds)) {
      const viaSql = await listEligibleEventIds(orgId, memberId, targeted);
      const viaOracle = new Set(
        targeted
          .filter((event) =>
            resolveEligibleMemberIds({
              ...snapshot,
              rules: rules.filter((rule) => rule.eventId === event.id),
            }).has(memberId),
          )
          .map((event) => event.id),
      );
      expect([...viaSql].sort(), memberName).toEqual([...viaOracle].sort());
    }
  });

  it("visibility gates before rules: org events need only an active member", async () => {
    const orgEvent = { id: eventIds.org, visibility: "org" as const };
    expect(await isEligible(orgId, memberIds.m6, orgEvent)).toBe(true);
    expect(await isEligible(orgId, memberIds.m5, orgEvent)).toBe(true); // the caller's gate, not ours
    const targeted = { id: eventIds.byGroup, visibility: "targeted" as const };
    expect(await isEligible(orgId, memberIds.m2, targeted)).toBe(true);
    expect(await isEligible(orgId, memberIds.m7, targeted)).toBe(false); // pending request
    expect(await isEligible(orgId, memberIds.m3, targeted)).toBe(false);
  });

  it("a suspended member is not eligible even when named", async () => {
    expect(await isEligible(orgId, memberIds.m5, { id: eventIds.byMember, visibility: "targeted" })).toBe(false);
    expect(await isEligible(orgId, memberIds.m6, { id: eventIds.byMember, visibility: "targeted" })).toBe(true);
  });

  it("the portal agenda runs the same number of queries however many events are targeted", async () => {
    const spy = vi.spyOn(pool, "query");
    await listEventsForViewer({ orgId, memberId: memberIds.m1 });
    const before = spy.mock.calls.length;
    expect(before).toBeGreaterThan(0); // the spy sees Drizzle's traffic
    spy.mockClear();

    const suffix = Date.now();
    for (const key of ["extra1", "extra2", "extra3"]) {
      const id = await makeEvent(key, suffix, "targeted");
      await db.insert(eventAudience).values({ orgId, eventId: id, kind: "group", groupId: groupIds.g1 });
    }
    spy.mockClear();

    const buckets = await listEventsForViewer({ orgId, memberId: memberIds.m1 });
    expect(spy.mock.calls.length).toBe(before);
    expect(buckets.invited.map((item) => item.event.title).sort()).toEqual(
      ["byCategory", "byGroup", "extra1", "extra2", "extra3", "mixed"],
    );
    expect(buckets.open.map((item) => item.event.title)).toEqual(["org"]);
  });

  it("recipient lists for every filter come from one audience resolution", async () => {
    const spy = vi.spyOn(pool, "query");
    const recipients = await getEventRecipients(orgId, eventIds.mixed);
    // organization + externals + responses + rules + snapshot (4) + member rows.
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(9);

    const emails = (list: { email: string }[]) => list.map((r) => r.email.split("-")[0]).sort();
    expect(emails(recipients.all_eligible)).toEqual(["m1", "m2", "m4", "m6"]);
    expect(emails(recipients.not_responded)).toEqual(["m1", "m2", "m4", "m6"]);
    expect(emails(recipients.not_activated)).toEqual(["m1", "m2", "m4", "m6"]);
    expect(recipients.externals).toEqual([
      { email: "guest@example.test", name: null, externalEmail: "guest@example.test" },
    ]);
    expect(recipients.accepted).toEqual([]);
    expect(recipients.reserve).toEqual([]);
  });
});
