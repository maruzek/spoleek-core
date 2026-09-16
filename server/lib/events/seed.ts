import { and, eq, like } from "drizzle-orm";

import { db } from "@/server/db";
import {
  eventAudience,
  eventResponses,
  events,
  groups,
  memberPayments,
  tenantMembers,
} from "@/server/db/schema";
import { upsertResponse } from "@/server/lib/events/responses";

/** Every fixture event carries this slug prefix so a reset removes exactly them. */
export const DEMO_EVENT_SLUG_PREFIX = "demo-";

/**
 * Four events that exercise the surfaces: a published org-wide one, a
 * targeted group event with capacity 5 and a few answers (one on the reserve
 * list), a draft, and a priced public trip whose answers cover every payment
 * state. Uses the org's first group and its first active members when
 * present; without them the group event is skipped rather than invented.
 */
export async function seedDemoEvents(orgId: string) {
  const now = Date.now();
  const day = 86_400_000;

  const [group] = await db.select().from(groups).where(eq(groups.orgId, orgId)).limit(1);
  const members = await db
    .select({ id: tenantMembers.id })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.status, "active")))
    .limit(4);

  const [orgWide] = await db
    .insert(events)
    .values({
      orgId,
      slug: `${DEMO_EVENT_SLUG_PREFIX}open-day`,
      title: "Open day",
      descriptionHtml: "<p>Come and see what we do. Bring a friend — up to two guests per person.</p>",
      ownerType: "organization",
      visibility: "public",
      status: "published",
      startsAt: new Date(now + 21 * day),
      endsAt: new Date(now + 21 * day + 4 * 3_600_000),
      locationName: "Clubhouse",
      locationAddress: "Example street 1, Prague",
      maxGuestsPerResponse: 2,
    })
    .returning({ id: events.id });

  await db.insert(events).values({
    orgId,
    slug: `${DEMO_EVENT_SLUG_PREFIX}planning-draft`,
    title: "Autumn planning (draft)",
    ownerType: "organization",
    visibility: "org",
    status: "draft",
  });

  const tripId = await seedPricedTrip(orgId, members.map((member) => member.id), now);

  if (!group) {
    return { created: 3, groupEventId: null, orgWideEventId: orgWide!.id, tripEventId: tripId };
  }

  const [camp] = await db
    .insert(events)
    .values({
      orgId,
      slug: `${DEMO_EVENT_SLUG_PREFIX}camp`,
      title: `${group.name} camp`,
      descriptionHtml: "<p>A weekend under canvas. Five places only.</p>",
      ownerType: "group",
      ownerGroupId: group.id,
      visibility: "targeted",
      status: "published",
      startsAt: new Date(now + 40 * day),
      endsAt: new Date(now + 42 * day),
      allDay: true,
      rsvpDeadlineAt: new Date(now + 30 * day),
      capacity: 5,
      maxGuestsPerResponse: 1,
      locationName: "Camp Sázava",
    })
    .returning({ id: events.id });

  await db.insert(eventAudience).values({ orgId, eventId: camp!.id, kind: "group", groupId: group.id });

  // 2 + 2 + 1 = 5 seats taken; the fourth answer lands on the reserve list.
  const answers = [
    { answer: "yes", guestCount: 1, standing: "confirmed" },
    { answer: "yes", guestCount: 1, standing: "confirmed" },
    { answer: "yes", guestCount: 0, standing: "confirmed" },
    { answer: "yes", guestCount: 0, standing: "reserve" },
  ] as const;

  await Promise.all(
    members.map((member, index) =>
      db.insert(eventResponses).values({
        orgId,
        eventId: camp!.id,
        memberId: member.id,
        ...answers[index]!,
        respondedAt: new Date(now - (answers.length - index) * 3_600_000),
      }),
    ),
  );

  return { created: 4, groupEventId: camp!.id, orgWideEventId: orgWide!.id, tripEventId: tripId };
}

/**
 * A public, priced trip with one payment in each state: pending, paid,
 * overdue (due date in the past), refund_due (paid, then answered no) and a
 * guest who owes for themselves plus one companion. Answers go through
 * `upsertResponse` so the payments are created by the real path; only the
 * statuses that need time to pass are set directly afterwards.
 */
async function seedPricedTrip(orgId: string, memberIds: string[], now: number) {
  const day = 86_400_000;

  const [trip] = await db
    .insert(events)
    .values({
      orgId,
      slug: `${DEMO_EVENT_SLUG_PREFIX}trip`,
      title: "Weekend trip to Šumava",
      descriptionHtml: "<p>Two nights in a mountain hut. 350 CZK per person covers the beds.</p>",
      ownerType: "organization",
      visibility: "public",
      status: "published",
      startsAt: new Date(now + 28 * day),
      endsAt: new Date(now + 30 * day),
      allDay: true,
      rsvpDeadlineAt: new Date(now + 14 * day),
      maxGuestsPerResponse: 2,
      locationName: "Modrava",
      priceAmount: 35_000,
      priceCurrency: "CZK",
      priceBankAccount: "CZ6508000000192000145399",
    })
    .returning();

  const answer = (responder: Parameters<typeof upsertResponse>[1]["responder"], guestCount = 0) =>
    db.transaction((tx) =>
      upsertResponse(tx, {
        orgId,
        eventId: trip!.id,
        responder,
        answer: "yes",
        guestCount,
        now: new Date(now - 2 * day),
      }),
    );

  // Pending, as the RSVP left it.
  if (memberIds[0]) await answer({ memberId: memberIds[0] });

  // Paid.
  if (memberIds[1]) {
    const { payment } = await answer({ memberId: memberIds[1] }, 1);
    if (payment.paymentId) {
      await db
        .update(memberPayments)
        .set({ status: "paid", paidAt: new Date(now - day) })
        .where(eq(memberPayments.id, payment.paymentId));
    }
  }

  // Overdue: the cron would flip it; here the due date is simply set back.
  if (memberIds[2]) {
    const { payment } = await answer({ memberId: memberIds[2] });
    if (payment.paymentId) {
      await db
        .update(memberPayments)
        .set({ status: "overdue", dueAt: new Date(now - 5 * day) })
        .where(eq(memberPayments.id, payment.paymentId));
    }
  }

  // Refund due: paid, then the answer changed to no.
  if (memberIds[3]) {
    const { payment } = await answer({ memberId: memberIds[3] });
    if (payment.paymentId) {
      await db
        .update(memberPayments)
        .set({ status: "paid", paidAt: new Date(now - day) })
        .where(eq(memberPayments.id, payment.paymentId));
    }
    await db.transaction((tx) =>
      upsertResponse(tx, {
        orgId,
        eventId: trip!.id,
        responder: { memberId: memberIds[3]! },
        answer: "no",
        guestCount: 0,
        now: new Date(now - day),
      }),
    );
  }

  // A guest with a companion: 2 × 350 CZK, pending.
  await answer({ guestEmail: "guest.demo@example.test", guestName: "Dana Guest" }, 1);

  return trip!.id;
}

export async function resetDemoEvents(orgId: string) {
  const removed = await db
    .delete(events)
    .where(and(eq(events.orgId, orgId), like(events.slug, `${DEMO_EVENT_SLUG_PREFIX}%`)))
    .returning({ slug: events.slug });

  return removed.map((row) => row.slug);
}
