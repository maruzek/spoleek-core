import { cache } from "react";
import { and, eq, exists, inArray, isNull, or, sql } from "drizzle-orm";

import {
  resolveEligibleMemberIds,
  type AudienceRule,
  type CategoryAdminRow,
  type GroupMembershipRow,
} from "@/lib/events/eligibility";
import { db } from "@/server/db";
import {
  categoryAdminAssignments,
  eventAudience,
  groupMemberships,
  groups,
  tenantMembers,
  type Event,
} from "@/server/db/schema";
import { activeMembership } from "@/server/lib/group-membership";

/**
 * Event eligibility (CONTEXT.md).
 *
 * Two shapes of question, two implementations:
 *
 * - "May *this* member see these events?" — `isEligible`, `listEligibleEventIds`.
 *   One SQL query that asks whether any rule on the event reaches the member,
 *   via their own active memberships. Nothing org-wide is loaded.
 * - "Whom do these events reach?" — `resolveAudiences`, `listEligibleMemberIds`.
 *   The org-wide audience snapshot is loaded once per request and the pure
 *   resolver runs over it, once per event.
 *
 * The pure resolver is the oracle; `tests/event-eligibility-db.test.ts` pins
 * the SQL path to it on a seeded org.
 */

// ─── One member, many events ────────────────────────────────────────────────

const activeMember = (orgId: string, memberId: string) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.orgId, orgId),
          eq(tenantMembers.id, memberId),
          eq(tenantMembers.status, "active"),
          isNull(tenantMembers.deletedAt),
        ),
      ),
  );

/** The `event_audience` rows that reach `memberId`, mirroring the pure resolver. */
function ruleReachesMember(orgId: string, memberId: string) {
  const myMemberships = and(
    eq(groupMemberships.orgId, orgId),
    eq(groupMemberships.memberId, memberId),
    activeMembership(),
  );
  const myGroupIds = db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(myMemberships);
  const myCategoryIds = db
    .select({ categoryId: groups.categoryId })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(myMemberships);

  return or(
    and(eq(eventAudience.kind, "member"), eq(eventAudience.memberId, memberId)),
    and(eq(eventAudience.kind, "group"), inArray(eventAudience.groupId, myGroupIds)),
    and(eq(eventAudience.kind, "category"), inArray(eventAudience.categoryId, myCategoryIds)),
  );
}

type VisibleEvent = Pick<Event, "id" | "visibility">;

/**
 * The ids of `events` the member may view and answer, per visibility:
 * `public` and `org` need nothing, `targeted` needs a rule that reaches an
 * active member. Drafts are the caller's business. One query however many
 * events are passed; none when none is targeted.
 */
export async function listEligibleEventIds(
  orgId: string,
  memberId: string,
  events: readonly VisibleEvent[],
): Promise<Set<string>> {
  const eligible = new Set<string>();
  const targeted: string[] = [];
  for (const event of events) {
    if (event.visibility === "targeted") targeted.push(event.id);
    else eligible.add(event.id);
  }
  if (targeted.length === 0) return eligible;

  const rows = await db
    .selectDistinct({ eventId: eventAudience.eventId })
    .from(eventAudience)
    .where(
      and(
        eq(eventAudience.orgId, orgId),
        inArray(eventAudience.eventId, targeted),
        ruleReachesMember(orgId, memberId),
        activeMember(orgId, memberId),
      ),
    );

  for (const row of rows) eligible.add(row.eventId);
  return eligible;
}

/** `listEligibleEventIds` for one event. */
export async function isEligible(
  orgId: string,
  memberId: string,
  event: VisibleEvent,
): Promise<boolean> {
  return (await listEligibleEventIds(orgId, memberId, [event])).has(event.id);
}

// ─── Many members: the audience snapshot ────────────────────────────────────

/** The org-wide inputs every audience rule resolves against. */
export type AudienceSnapshot = {
  groupMemberships: GroupMembershipRow[];
  groupsByCategory: Map<string, string>;
  activeMemberIds: Set<string>;
  /** Only forms scope a category rule to its admins; events never do. */
  categoryAdmins: CategoryAdminRow[];
};

/**
 * Loaded once per request (React `cache`), so a page that resolves the
 * audience of an event and then its recipients reads the membership table
 * once. Outside a request context (tests) it is a plain function.
 */
export const loadAudienceSnapshot = cache(async (orgId: string): Promise<AudienceSnapshot> => {
  const [memberships, groupRows, activeRows, admins] = await Promise.all([
    db
      .select({
        groupId: groupMemberships.groupId,
        memberId: groupMemberships.memberId,
        role: groupMemberships.role,
      })
      .from(groupMemberships)
      .where(and(eq(groupMemberships.orgId, orgId), activeMembership())),
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
    db
      .select({
        categoryId: categoryAdminAssignments.categoryId,
        memberId: categoryAdminAssignments.memberId,
      })
      .from(categoryAdminAssignments)
      .where(eq(categoryAdminAssignments.orgId, orgId)),
  ]);

  return {
    groupMemberships: memberships,
    groupsByCategory: new Map(groupRows.map((row) => [row.id, row.categoryId])),
    activeMemberIds: new Set(activeRows.map((row) => row.id)),
    categoryAdmins: admins,
  };
});

/**
 * The members each event's audience rules reach, keyed by event id. Every
 * requested id is present (an event with no rules maps to an empty set). One
 * rules query plus the snapshot, however many events.
 */
export async function resolveAudiences(
  orgId: string,
  eventIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (eventIds.length === 0) return out;

  const [snapshot, ruleRows] = await Promise.all([
    loadAudienceSnapshot(orgId),
    db
      .select({
        eventId: eventAudience.eventId,
        kind: eventAudience.kind,
        groupId: eventAudience.groupId,
        categoryId: eventAudience.categoryId,
        memberId: eventAudience.memberId,
      })
      .from(eventAudience)
      .where(and(eq(eventAudience.orgId, orgId), inArray(eventAudience.eventId, [...eventIds]))),
  ]);

  const rulesByEvent = new Map<string, AudienceRule[]>();
  for (const { eventId, ...rule } of ruleRows) {
    const list = rulesByEvent.get(eventId) ?? [];
    list.push(rule);
    rulesByEvent.set(eventId, list);
  }

  for (const eventId of eventIds) {
    out.set(
      eventId,
      resolveEligibleMemberIds({ ...snapshot, rules: rulesByEvent.get(eventId) ?? [] }),
    );
  }
  return out;
}

/** `resolveAudiences` for one event. */
export async function listEligibleMemberIds(orgId: string, eventId: string): Promise<Set<string>> {
  return (await resolveAudiences(orgId, [eventId])).get(eventId) ?? new Set();
}
