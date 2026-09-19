import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { isLivePayment, type EventPaymentView } from "@/lib/events/payment-plan";
import { eventEndInstant, seatsTaken } from "@/lib/events/rsvp";
import type { EventRecipientFilter } from "@/lib/events/schemas";
import type { Viewer } from "@/lib/access/viewer";

import { db } from "@/server/db";
import {
  eventAudience,
  eventResponses,
  events,
  groupCategories,
  groups,
  memberPayments,
  organizations,
  tenantMembers,
  type Event,
  type EventResponse,
} from "@/server/db/schema";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import { listManageableOwners, requireGroupAdminModuleAccess } from "@/server/queries/access";
import { isEligible, listEligibleEventIds, resolveAudiences } from "@/server/queries/event-eligibility";

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

const memberColumns = {
  id: tenantMembers.id,
  firstName: tenantMembers.firstName,
  lastName: tenantMembers.lastName,
  email: tenantMembers.email,
  workspaceUserEmail: tenantMembers.workspaceUserEmail,
  preferredEmail: tenantMembers.preferredEmail,
  userId: tenantMembers.userId,
};

// ─── Counts and responses ───────────────────────────────────────────────────

/** The payment columns the portal card and the response list render. */
export const eventPaymentViewColumns = {
  id: memberPayments.id,
  status: memberPayments.status,
  amount: memberPayments.amount,
  currency: memberPayments.currency,
  bankAccount: memberPayments.bankAccount,
  variableSymbol: memberPayments.variableSymbol,
  periodLabel: memberPayments.periodLabel,
  dueAt: memberPayments.dueAt,
  paidAt: memberPayments.paidAt,
};

/** Join condition for "the live payment of this response" (at most one). */
const livePaymentJoin = and(
  eq(memberPayments.responseId, eventResponses.id),
  ne(memberPayments.status, "cancelled"),
);

export type EventCounts = {
  confirmedSeats: number;
  reserveCount: number;
  yesCount: number;
  noCount: number;
  maybeCount: number;
  /** Responses that owe a payment (live, not refund_due). */
  chargedCount: number;
  paidCount: number;
  collectedMinor: number;
  outstandingMinor: number;
  currency: string | null;
};

export async function getEventCounts(orgId: string, eventId: string): Promise<EventCounts> {
  const rows = await db
    .select({
      answer: eventResponses.answer,
      standing: eventResponses.standing,
      guestCount: eventResponses.guestCount,
      paymentStatus: memberPayments.status,
      paymentAmount: memberPayments.amount,
      paymentCurrency: memberPayments.currency,
    })
    .from(eventResponses)
    .leftJoin(memberPayments, livePaymentJoin)
    .where(and(eq(eventResponses.orgId, orgId), eq(eventResponses.eventId, eventId)));

  let chargedCount = 0;
  let paidCount = 0;
  let collectedMinor = 0;
  let outstandingMinor = 0;
  let currency: string | null = null;
  for (const row of rows) {
    if (!row.paymentStatus || row.paymentStatus === "refund_due") continue;
    chargedCount += 1;
    currency ??= row.paymentCurrency;
    if (row.paymentStatus === "paid") {
      paidCount += 1;
      collectedMinor += row.paymentAmount ?? 0;
    } else {
      outstandingMinor += row.paymentAmount ?? 0;
    }
  }

  return {
    confirmedSeats: seatsTaken(rows),
    reserveCount: rows.filter((row) => row.answer === "yes" && row.standing === "reserve").length,
    yesCount: rows.filter((row) => row.answer === "yes").length,
    noCount: rows.filter((row) => row.answer === "no").length,
    maybeCount: rows.filter((row) => row.answer === "maybe").length,
    chargedCount,
    paidCount,
    collectedMinor,
    outstandingMinor,
    currency,
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
  /** The live payment, when the event charged this response. */
  payment: EventPaymentView | null;
};

export async function listEventResponses(orgId: string, eventId: string): Promise<EventResponseRow[]> {
  const rows = await db
    .select({ response: eventResponses, member: memberColumns, payment: eventPaymentViewColumns })
    .from(eventResponses)
    .leftJoin(tenantMembers, eq(tenantMembers.id, eventResponses.memberId))
    .leftJoin(memberPayments, livePaymentJoin)
    .where(and(eq(eventResponses.orgId, orgId), eq(eventResponses.eventId, eventId)))
    .orderBy(asc(eventResponses.respondedAt));

  return rows.map((row) => ({
    ...row.response,
    member: row.member?.id ? row.member : null,
    payment: row.payment?.id ? (row.payment as EventPaymentView) : null,
  }));
}

/** The live payment for one response, for the portal and token pages. */
export async function getLivePaymentForResponse(
  orgId: string,
  responseId: string,
): Promise<EventPaymentView | null> {
  const [row] = await db
    .select(eventPaymentViewColumns)
    .from(memberPayments)
    .where(
      and(
        eq(memberPayments.orgId, orgId),
        eq(memberPayments.responseId, responseId),
        ne(memberPayments.status, "cancelled"),
      ),
    )
    .limit(1);

  return row && isLivePayment(row.status) ? row : null;
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
 * Every recipient list at once, keyed by filter: the copy buttons and the
 * send dialog read the same lists, so the number the manager approves is the
 * number that gets mailed. Each list is deduped by lower-cased address; the
 * first entry wins. The event's audience is resolved once for all filters.
 */
export async function getEventRecipients(
  orgId: string,
  eventId: string,
): Promise<Record<EventRecipientFilter, EventRecipient[]>> {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!organization) {
    return {
      all_eligible: [],
      not_responded: [],
      not_activated: [],
      accepted: [],
      reserve: [],
      externals: [],
    };
  }

  const [externals, responses, audience] = await Promise.all([
    db
      .select({ email: eventAudience.externalEmail, name: eventAudience.externalName })
      .from(eventAudience)
      .where(
        and(
          eq(eventAudience.orgId, orgId),
          eq(eventAudience.eventId, eventId),
          eq(eventAudience.kind, "external"),
        ),
      ),
    listEventResponses(orgId, eventId),
    resolveAudiences(orgId, [eventId]),
  ]);
  const eligibleIds = [...(audience.get(eventId) ?? [])];
  const members =
    eligibleIds.length === 0
      ? []
      : await db
          .select(memberColumns)
          .from(tenantMembers)
          .where(and(eq(tenantMembers.orgId, orgId), inArray(tenantMembers.id, eligibleIds)))
          .orderBy(asc(tenantMembers.lastName), asc(tenantMembers.firstName));

  const memberName = (member: { firstName: string; lastName: string }) => {
    const name = `${member.firstName} ${member.lastName}`.trim();
    return name.length > 0 ? name : null;
  };

  /** One deduped list per filter. */
  const collect = (fill: (push: (recipient: EventRecipient) => void) => void) => {
    const list: EventRecipient[] = [];
    const seen = new Set<string>();
    fill((recipient) => {
      const key = recipient.email.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push({ ...recipient, email: key });
    });
    return list;
  };

  const externalRecipients = collect((push) => {
    for (const row of externals) {
      if (row.email) push({ email: row.email, name: row.name, externalEmail: row.email.toLowerCase() });
    }
  });

  const byStanding = (standing: "confirmed" | "reserve") =>
    collect((push) => {
      for (const row of responses) {
        if (row.answer !== "yes" || row.standing !== standing) continue;
        if (row.member) {
          const email = resolveMemberEmailForOrg({ member: row.member, organization });
          if (email) push({ email, name: memberName(row.member), memberId: row.member.id });
        } else if (row.guestEmail) {
          push({ email: row.guestEmail, name: row.guestName, externalEmail: row.guestEmail.toLowerCase() });
        }
      }
    });

  const responded = new Set(
    responses.map((row) => row.memberId).filter((id): id is string => id != null),
  );
  const eligibleWhere = (keep: (member: (typeof members)[number]) => boolean) =>
    collect((push) => {
      for (const member of members) {
        if (!keep(member)) continue;
        const email = resolveMemberEmailForOrg({ member, organization });
        if (email) push({ email, name: memberName(member), memberId: member.id });
      }
    });

  return {
    all_eligible: eligibleWhere(() => true),
    not_responded: eligibleWhere((member) => !responded.has(member.id)),
    not_activated: eligibleWhere((member) => !member.userId),
    accepted: byStanding("confirmed"),
    reserve: byStanding("reserve"),
    externals: externalRecipients,
  };
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
export async function listEventsForManager(viewer: Viewer) {
  const context = await requireGroupAdminModuleAccess(viewer);
  const owners = await listManageableOwners(viewer);
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

  const eligibleIds = await listEligibleEventIds(
    orgId,
    memberId,
    all.map((row) => row.event),
  );
  const visible = all.filter((row) => eligibleIds.has(row.event.id));

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

  return (await isEligible(orgId, viewer.memberId, event)) ? row : null;
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
