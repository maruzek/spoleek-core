import { and, eq, like } from "drizzle-orm";

import { db } from "@/server/db";
import { eventAudience, eventResponses, events, groups, tenantMembers } from "@/server/db/schema";

/** Every fixture event carries this slug prefix so a reset removes exactly them. */
export const DEMO_EVENT_SLUG_PREFIX = "demo-";

/**
 * Three events that exercise the surfaces: a published org-wide one, a
 * targeted group event with capacity 5 and a few answers (one on the reserve
 * list), and a draft. Uses the org's first group and its first active members
 * when present; without them the group event is skipped rather than invented.
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

  if (!group) {
    return { created: 2, groupEventId: null, orgWideEventId: orgWide!.id };
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

  return { created: 3, groupEventId: camp!.id, orgWideEventId: orgWide!.id };
}

export async function resetDemoEvents(orgId: string) {
  const removed = await db
    .delete(events)
    .where(and(eq(events.orgId, orgId), like(events.slug, `${DEMO_EVENT_SLUG_PREFIX}%`)))
    .returning({ slug: events.slug });

  return removed.map((row) => row.slug);
}
