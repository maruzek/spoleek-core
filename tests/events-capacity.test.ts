import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/server/db";
import {
  eventAudience,
  eventResponses,
  eventRsvpTokens,
  events,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import { EventError, upsertResponse } from "@/server/lib/events/responses";
import { shredEventGuestData } from "@/server/lib/events/retention";

/**
 * The one RSVP rule the pure tests cannot prove: two people racing for the
 * last seat end with exactly one confirmed. `upsertResponse` locks the event
 * row `FOR UPDATE`, so the second transaction waits and reads the first's
 * committed row. Without the lock both would read "0 taken" and both confirm.
 *
 * Needs a database. Creates its own organization and deletes it afterwards —
 * every event table hangs off `org_id` with `ON DELETE CASCADE`.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("RSVP capacity under concurrency", () => {
  let orgId: string;

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

  async function makeEvent(overrides: Partial<typeof events.$inferInsert> = {}) {
    const [event] = await db
      .insert(events)
      .values({
        orgId,
        slug: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: "Capacity test",
        ownerType: "organization",
        visibility: "org",
        status: "published",
        capacity: 1,
        maxGuestsPerResponse: 2,
        ...overrides,
      })
      .returning({ id: events.id });

    return event.id;
  }

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({
        name: "Events Test Org",
        slug: `events-test-${Date.now()}`,
        eventGuestRetentionDays: 30,
      })
      .returning({ id: organizations.id });
    orgId = org.id;
  });

  afterAll(async () => {
    if (orgId) {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    await pool.end();
  });

  it("gives the last seat to exactly one of two concurrent yes answers", async () => {
    const eventId = await makeEvent({ capacity: 1 });
    const [alice, bob] = await Promise.all([makeMember("Alice"), makeMember("Bob")]);

    const answer = (memberId: string) =>
      db.transaction((tx) =>
        upsertResponse(tx, {
          orgId,
          eventId,
          responder: { memberId },
          answer: "yes",
          guestCount: 0,
        }),
      );

    const results = await Promise.all([answer(alice), answer(bob)]);
    const standings = results.map((r) => r.response.standing).sort();

    expect(standings).toEqual(["confirmed", "reserve"]);
  });

  it("does not count the responder's own row when they change their answer", async () => {
    const eventId = await makeEvent({ capacity: 2 });
    const carol = await makeMember("Carol");

    const respond = (guestCount: number, answer: "yes" | "no" = "yes") =>
      db.transaction((tx) =>
        upsertResponse(tx, {
          orgId,
          eventId,
          responder: { memberId: carol },
          answer,
          guestCount,
        }),
      );

    expect((await respond(1)).response.standing).toBe("confirmed"); // 2 of 2
    expect((await respond(0)).response.standing).toBe("confirmed"); // 1 of 2, own row excluded
    expect((await respond(2)).response.standing).toBe("reserve"); // 3 > 2, party as a whole
    expect((await respond(0, "no")).response.standing).toBe("confirmed"); // no frees seats
  });

  it("refuses more guests than allowed and answers when RSVP is closed", async () => {
    const eventId = await makeEvent({ maxGuestsPerResponse: 1 });
    const dave = await makeMember("Dave");

    await expect(
      db.transaction((tx) =>
        upsertResponse(tx, {
          orgId,
          eventId,
          responder: { memberId: dave },
          answer: "yes",
          guestCount: 2,
        }),
      ),
    ).rejects.toMatchObject({ code: "TOO_MANY_GUESTS" } satisfies Partial<EventError>);

    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, eventId));

    await expect(
      db.transaction((tx) =>
        upsertResponse(tx, {
          orgId,
          eventId,
          responder: { memberId: dave },
          answer: "yes",
          guestCount: 0,
        }),
      ),
    ).rejects.toMatchObject({ code: "RSVP_CLOSED" } satisfies Partial<EventError>);
  });

  it("shreds guest identities after the retention window but keeps headcounts", async () => {
    const past = new Date(Date.now() - 40 * 86_400_000);
    const eventId = await makeEvent({ startsAt: past, capacity: null });
    const recentId = await makeEvent({ startsAt: new Date(), capacity: null });

    for (const id of [eventId, recentId]) {
      await db.insert(eventResponses).values({
        orgId,
        eventId: id,
        guestEmail: "guest@example.test",
        guestName: "Guest",
        answer: "yes",
        guestCount: 1,
      });
      await db.insert(eventAudience).values({
        orgId,
        eventId: id,
        kind: "external",
        externalEmail: "guest@example.test",
      });
      await db.insert(eventRsvpTokens).values({
        orgId,
        eventId: id,
        externalEmail: "guest@example.test",
        tokenHash: `hash-${id}`,
      });
    }

    const result = await shredEventGuestData();
    expect(result.responsesAnonymised).toBeGreaterThanOrEqual(1);

    const [old] = await db.select().from(eventResponses).where(eq(eventResponses.eventId, eventId));
    expect(old).toMatchObject({ guestEmail: null, guestName: null, answer: "yes", guestCount: 1 });

    const [recent] = await db.select().from(eventResponses).where(eq(eventResponses.eventId, recentId));
    expect(recent.guestEmail).toBe("guest@example.test");

    const tokens = await db.select().from(eventRsvpTokens).where(eq(eventRsvpTokens.eventId, eventId));
    expect(tokens).toHaveLength(0);
    const externals = await db.select().from(eventAudience).where(eq(eventAudience.eventId, eventId));
    expect(externals).toHaveLength(0);
  });
});
