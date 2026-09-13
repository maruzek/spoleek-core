import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { resolveEligibleMemberIds } from "@/lib/events/eligibility";
import { eventEndInstant, seatsTaken } from "@/lib/events/rsvp";
import type { EventRecipientFilter } from "@/lib/events/schemas";
import { db } from "@/server/db";
import {
  eventAudience,
  eventResponses,
  events,
  groupCategories,
  groupMemberships,
  groups,
  organizations,
  tenantMembers,
  type Event,
  type EventResponse,
} from "@/server/db/schema";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import { listManageableOwners, requireGroupAdminModuleAccess } from "@/server/queries/access";

const liveEvent = (orgId: string) => and(eq(events.orgId, orgId), isNull(events.deletedAt));

const ownerName = sql<string | null>`coalesce(${groups.name}, ${groupCategories.name})`;

type OwnerJoined = { event: Event; ownerName: string | null };

async function selectEventsWithOwner(where: ReturnType<typeof and>) {
  const rows = await db
    .select({ event: events, ownerName })
    .from(events)
    .leftJoin(groups, eq(groups.id, events.ownerGroupId))
    .leftJoin(groupCategories, eq(groupCategories.id, events.ownerCategoryId))
    .where(where)
    .orderBy(asc(events.startsAt), asc(events.createdAt));

  return rows as OwnerJoined[];
}

// ─── Eligibility ────────────────────────────────────────────────────────────

/** Loads everything `resolveEligibleMemberIds` needs for one event. */
async function loadEligibilityInputs(orgId: string, eventId: string) {
  const [rules, memberships, groupRows, activeRows] = await Promise.all([
    db
      .select({
        kind: eventAudience.kind,
        groupId: eventAudience.groupId,
        categoryId: eventAudience.categoryId,
        memberId: eventAudience.memberId,
      })
      .from(eventAudience)
      .where(and(eq(eventAudience.orgId, orgId), eq(eventAudience.eventId, eventId))),
    db
      .select({ groupId: groupMemberships.groupId, memberId: groupMemberships.memberId })
      .from(groupMemberships)
      .where(eq(groupMemberships.orgId, orgId)),
    db
      .select({ id: groups.id, categoryId: groups.categoryId })
      .from(groups)
      .where(eq(groups.orgId, orgId)),
    db
      .select({ id: tenantMembers.id })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.orgId, orgId),
          eq(tenantMembers.status, "active"),
          isNull(tenantMembers.deletedAt),
        ),
      ),
  ]);

  return {
    rules,
    groupMemberships: memberships,
    groupsByCategory: new Map(groupRows.map((row) => [row.id, row.categoryId])),
    activeMemberIds: new Set(activeRows.map((row) => row.id)),
  };
}

export async function listEligibleMemberIds(orgId: string, eventId: string) {
  return resolveEligibleMemberIds(await loadEligibilityInputs(orgId, eventId));
}

/**
 * Whether a member may view and answer an event, per visibility. Drafts are
 * for managers only and are handled by the caller.
 */
export async function isMemberEligibleForEvent(params: {
  orgId: string;
  event: Pick<Event, "id" | "visibility">;
  memberId: string;
}) {
  if (params.event.visibility !== "targeted") return true;
  const ids = await listEligibleMemberIds(params.orgId, params.event.id);
  return ids.has(params.memberId);
}

const memberColumns = {
  id: tenantMembers.id,
  firstName: tenantMembers.firstName,
  lastName: tenantMembers.lastName,
  email: tenantMembers.email,
  workspaceUserEmail: tenantMembers.workspaceUserEmail,
  preferredEmail: tenantMembers.preferredEmail,
  userId: tenantMembers.userId,
};

export async function listEligibleMembers(orgId: string, eventId: string) {
  const ids = [...(await listEligibleMemberIds(orgId, eventId))];
  if (ids.length === 0) return [];

  return db
    .select(memberColumns)
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, orgId), inArray(tenantMembers.id, ids)))
    .orderBy(asc(tenantMembers.lastName), asc(tenantMembers.firstName));
}

// ─── Counts and responses ───────────────────────────────────────────────────

export async function getEventCounts(orgId: string, eventId: string) {
  const rows = await db
    .select({
      answer: eventResponses.answer,
      standing: eventResponses.standing,
      guestCount: eventResponses.guestCount,
    })
    .from(eventResponses)
    .where(and(eq(eventResponses.orgId, orgId), eq(eventResponses.eventId, eventId)));

  return {
    confirmedSeats: seatsTaken(rows),
    reserveCount: rows.filter((row) => row.answer === "yes" && row.standing === "reserve").length,
    yesCount: rows.filter((row) => row.answer === "yes").length,
    noCount: rows.filter((row) => row.answer === "no").length,
    maybeCount: rows.filter((row) => row.answer === "maybe").length,
  };
}

export type EventResponseRow = EventResponse & {
  member: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    workspaceUserEmail: string | null;
    preferredEmail: "personal" | "workspace" | null;
    userId: string | null;
  } | null;
};

export async function listEventResponses(orgId: string, eventId: string): Promise<EventResponseRow[]> {
  const rows = await db
    .select({ response: eventResponses, member: memberColumns })
    .from(eventResponses)
    .leftJoin(tenantMembers, eq(tenantMembers.id, eventResponses.memberId))
    .where(and(eq(eventResponses.orgId, orgId), eq(eventResponses.eventId, eventId)))
    .orderBy(asc(eventResponses.respondedAt));

  return rows.map((row) => ({ ...row.response, member: row.member?.id ? row.member : null }));
}

export async function getMemberResponse(orgId: string, eventId: string, memberId: string) {
  const [row] = await db
    .select()
    .from(eventResponses)
    .where(
      and(
        eq(eventResponses.orgId, orgId),
        eq(eventResponses.eventId, eventId),
        eq(eventResponses.memberId, memberId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listEventAudience(orgId: string, eventId: string) {
  return db
    .select({
      rule: eventAudience,
      groupName: groups.name,
      categoryName: groupCategories.name,
      memberFirstName: tenantMembers.firstName,
      memberLastName: tenantMembers.lastName,
    })
    .from(eventAudience)
    .leftJoin(groups, eq(groups.id, eventAudience.groupId))
    .leftJoin(groupCategories, eq(groupCategories.id, eventAudience.categoryId))
    .leftJoin(tenantMembers, eq(tenantMembers.id, eventAudience.memberId))
    .where(and(eq(eventAudience.orgId, orgId), eq(eventAudience.eventId, eventId)))
    .orderBy(asc(eventAudience.createdAt));
}

// ─── Recipients ─────────────────────────────────────────────────────────────

export type EventRecipient = {
  email: string;
  name: string | null;
  memberId?: string;
  externalEmail?: string;
};

/**
 * The one list behind both the copy buttons and the send dialog, so the
 * number the manager approves is the number that gets mailed. Deduped by
 * lower-cased address; the first entry wins.
 */
export async function getEventRecipients(
  orgId: string,
  eventId: string,
  filter: EventRecipientFilter,
): Promise<EventRecipient[]> {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!organization) return [];

  const out: EventRecipient[] = [];
  const seen = new Set<string>();

  const push = (recipient: EventRecipient) => {
    const key = recipient.email.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...recipient, email: key });
  };

  const memberName = (member: { firstName: string; lastName: string }) => {
    const name = `${member.firstName} ${member.lastName}`.trim();
    return name.length > 0 ? name : null;
  };

  if (filter === "externals") {
    const rows = await db
      .select({ email: eventAudience.externalEmail, name: eventAudience.externalName })
      .from(eventAudience)
      .where(
        and(
          eq(eventAudience.orgId, orgId),
          eq(eventAudience.eventId, eventId),
          eq(eventAudience.kind, "external"),
        ),
      );

    for (const row of rows) {
      if (row.email) push({ email: row.email, name: row.name, externalEmail: row.email.toLowerCase() });
    }

    return out;
  }

  if (filter === "accepted" || filter === "reserve") {
    const rows = await listEventResponses(orgId, eventId);
    const standing = filter === "accepted" ? "confirmed" : "reserve";

    for (const row of rows) {
      if (row.answer !== "yes" || row.standing !== standing) continue;

      if (row.member) {
        const email = resolveMemberEmailForOrg({ member: row.member, organization });
        if (email) push({ email, name: memberName(row.member), memberId: row.member.id });
      } else if (row.guestEmail) {
        push({ email: row.guestEmail, name: row.guestName, externalEmail: row.guestEmail.toLowerCase() });
      }
    }

    return out;
  }

  const members = await listEligibleMembers(orgId, eventId);
  const responded =
    filter === "not_responded"
      ? new Set(
          (await listEventResponses(orgId, eventId))
            .map((row) => row.memberId)
            .filter((id): id is string => id != null),
        )
      : null;

  for (const member of members) {
    if (responded && responded.has(member.id)) continue;
    if (filter === "not_activated" && member.userId) continue;

    const email = resolveMemberEmailForOrg({ member, organization });
    if (email) push({ email, name: memberName(member), memberId: member.id });
  }

  return out;
}

// ─── Lists and detail ───────────────────────────────────────────────────────

export type EventListItem = {
  event: Event;
  ownerName: string | null;
  confirmedSeats: number;
  reserveCount: number;
};

async function attachCounts(orgId: string, rows: OwnerJoined[]): Promise<EventListItem[]> {
  if (rows.length === 0) return [];

  const counts = await db
    .select({
      eventId: eventResponses.eventId,
      answer: eventResponses.answer,
      standing: eventResponses.standing,
      guestCount: eventResponses.guestCount,
    })
    .from(eventResponses)
    .where(
      and(
        eq(eventResponses.orgId, orgId),
        inArray(
          eventResponses.eventId,
          rows.map((row) => row.event.id),
        ),
      ),
    );

  const byEvent = new Map<string, typeof counts>();
  for (const row of counts) {
    const list = byEvent.get(row.eventId) ?? [];
    list.push(row);
    byEvent.set(row.eventId, list);
  }

  return rows.map((row) => {
    const list = byEvent.get(row.event.id) ?? [];
    return {
      event: row.event,
      ownerName: row.ownerName,
      confirmedSeats: seatsTaken(list),
      reserveCount: list.filter((r) => r.answer === "yes" && r.standing === "reserve").length,
    };
  });
}

/** Admin table: every live event whose owner the viewer may manage. */
export async function listEventsForManager() {
  const context = await requireGroupAdminModuleAccess();
  const owners = await listManageableOwners(context);
  const orgId = context.organization.id;

  const ownerClauses = [
    owners.organization ? eq(events.ownerType, "organization") : null,
    owners.categoryIds.length > 0 ? inArray(events.ownerCategoryId, owners.categoryIds) : null,
    owners.groupIds.length > 0 ? inArray(events.ownerGroupId, owners.groupIds) : null,
  ].filter((clause): clause is NonNullable<typeof clause> => clause != null);

  if (ownerClauses.length === 0) {
    return { context, owners, items: [] as EventListItem[] };
  }

  const rows = await selectEventsWithOwner(and(liveEvent(orgId), or(...ownerClauses)));

  return { context, owners, items: await attachCounts(orgId, rows) };
}

export type ViewerEventItem = EventListItem & { response: EventResponse | null };

/**
 * Portal buckets: invited (targeted, eligible), open (public / org), past.
 * Every bucket carries the member's own response so the card can show a badge.
 */
export async function listEventsForViewer(params: { orgId: string; memberId: string }) {
  const { orgId, memberId } = params;
  const now = new Date();

  const rows = await selectEventsWithOwner(
    and(liveEvent(orgId), eq(events.status, "published")),
  );
  // Cancelled events stay visible to whoever could see them.
  const cancelled = await selectEventsWithOwner(
    and(liveEvent(orgId), eq(events.status, "cancelled")),
  );
  const all = [...rows, ...cancelled];

  const visible: OwnerJoined[] = [];
  for (const row of all) {
    if (row.event.visibility !== "targeted") {
      visible.push(row);
      continue;
    }
    const ids = await listEligibleMemberIds(orgId, row.event.id);
    if (ids.has(memberId)) visible.push(row);
  }

  const items = await attachCounts(orgId, visible);
  const responses =
    items.length > 0
      ? await db
          .select()
          .from(eventResponses)
          .where(
            and(
              eq(eventResponses.orgId, orgId),
              eq(eventResponses.memberId, memberId),
              inArray(
                eventResponses.eventId,
                items.map((item) => item.event.id),
              ),
            ),
          )
      : [];
  const responseByEvent = new Map(responses.map((row) => [row.eventId, row]));

  const withResponse: ViewerEventItem[] = items.map((item) => ({
    ...item,
    response: responseByEvent.get(item.event.id) ?? null,
  }));

  const isPast = (item: ViewerEventItem) => {
    const end = eventEndInstant(item.event);
    return end != null && end < now;
  };

  return {
    invited: withResponse.filter((item) => !isPast(item) && item.event.visibility === "targeted"),
    open: withResponse.filter((item) => !isPast(item) && item.event.visibility !== "targeted"),
    past: withResponse.filter(isPast).sort((a, b) => {
      const ea = eventEndInstant(a.event)?.getTime() ?? 0;
      const eb = eventEndInstant(b.event)?.getTime() ?? 0;
      return eb - ea;
    }),
  };
}

export async function getEventById(orgId: string, eventId: string) {
  const [row] = await selectEventsWithOwner(and(liveEvent(orgId), eq(events.id, eventId)));
  return row ?? null;
}

export async function getEventBySlug(orgId: string, slug: string) {
  const [row] = await selectEventsWithOwner(and(liveEvent(orgId), eq(events.slug, slug)));
  return row ?? null;
}

/**
 * A published event as a viewer may see it, or null.
 *
 * `viewer` decides the visibility check: `public` needs nothing, `org` needs a
 * member, `targeted` needs an eligible member. Drafts are never returned here —
 * managers read through `requireEventManagementAccess` instead.
 */
export async function getEventDetail(
  orgId: string,
  idOrSlug: { id: string } | { slug: string },
  viewer: { memberId: string } | null,
) {
  const row =
    "id" in idOrSlug
      ? await getEventById(orgId, idOrSlug.id)
      : await getEventBySlug(orgId, idOrSlug.slug);

  if (!row || row.event.status === "draft") return null;

  const { event } = row;

  if (event.visibility === "public") return row;
  if (!viewer) return null;
  if (event.visibility === "org") return row;

  const ids = await listEligibleMemberIds(orgId, event.id);
  return ids.has(viewer.memberId) ? row : null;
}

export async function listEventsForOwnerPicker(orgId: string) {
  const [categoryRows, groupRows] = await Promise.all([
    db
      .select({ id: groupCategories.id, name: groupCategories.name })
      .from(groupCategories)
      .where(eq(groupCategories.orgId, orgId))
      .orderBy(asc(groupCategories.sortOrder)),
    db
      .select({ id: groups.id, name: groups.name, categoryId: groups.categoryId })
      .from(groups)
      .where(eq(groups.orgId, orgId))
      .orderBy(asc(groups.sortOrder)),
  ]);

  return { categories: categoryRows, groups: groupRows };
}
