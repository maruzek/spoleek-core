import { and, asc, desc, eq, inArray, or, sql, sum } from "drizzle-orm";

import { PAYMENT_STATUS_SORT_ORDER } from "@/lib/payments";
import { canActOnPayment, type PaymentScope } from "@/lib/payments/scope";
import { db } from "@/server/db";
import {
  eventResponses,
  events,
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  tenantMembers,
  type MemberPayment,
  type MemberPaymentStatus,
  type MemberPaymentType,
} from "@/server/db/schema";
import { activeMembership } from "@/server/lib/group-membership";

export type PaymentStatBucket = { count: number; totalCents: number };

export type PaymentStats = {
  paid: PaymentStatBucket;
  pending: PaymentStatBucket;
  overdue: PaymentStatBucket;
  /** Paid, then withdrawn: money the org owes back. Not part of the collection rate. */
  refundDue: PaymentStatBucket;
  /** The same three buckets split by payment type. */
  byType: Record<
    MemberPaymentType,
    { paid: PaymentStatBucket; pending: PaymentStatBucket; overdue: PaymentStatBucket }
  >;
  collectionRate: number;
  projectedIncomeCents: number;
};

export type PaymentMemberGroup = {
  id: string;
  name: string;
  /** For sectioning the group filter; the category's sort order keeps sections in admin order. */
  categoryId: string;
  categoryName: string;
  categorySortOrder: number;
};

export type PaymentRow = MemberPayment & {
  memberFirstName: string | null;
  memberLastName: string | null;
  memberEmail: string | null;
  /** Member name, or the guest name from the RSVP, or "Guest" once shredded. */
  memberName: string;
  /** Set for a guest's event payment while the RSVP still carries a name. */
  guestName: string | null;
  eventTitle: string | null;
  eventSlug: string | null;
  /** Every group the payer belongs to. Drives the group filter on the
   *  dashboard; a member can sit in several, so this is a list, not a field. */
  memberGroups: PaymentMemberGroup[];
  /** Whether the viewer whose scope listed this row may also act on it. */
  canAct: boolean;
};

/** How a payer with no member row (a guest) is named once the RSVP is shredded. */
export const GUEST_PAYER_FALLBACK_NAME = "Guest";

function payerName(row: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  guestName: string | null;
  memberId: string | null;
}): string {
  if (row.memberId) {
    return (
      [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || "Unknown"
    );
  }
  return row.guestName || GUEST_PAYER_FALLBACK_NAME;
}

/**
 * Group membership for a set of members, as a lookup keyed by member id.
 *
 * Fetched separately from the payments themselves on purpose: joining groups
 * into the main query would multiply a payment row once per group the payer is
 * in, which breaks both the row count and the ORDER BY below.
 */
async function getGroupsByMember(
  orgId: string,
  memberIds: string[],
): Promise<Map<string, PaymentMemberGroup[]>> {
  if (memberIds.length === 0) return new Map();

  const rows = await db
    .select({
      memberId: groupMemberships.memberId,
      groupId: groups.id,
      groupName: groups.name,
      categoryId: groupCategories.id,
      categoryName: groupCategories.name,
      categorySortOrder: groupCategories.sortOrder,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .innerJoin(groupCategories, eq(groups.categoryId, groupCategories.id))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        activeMembership(),
        inArray(groupMemberships.memberId, memberIds),
      ),
    )
    .orderBy(asc(groups.name));

  const byMember = new Map<string, PaymentMemberGroup[]>();

  for (const row of rows) {
    const list = byMember.get(row.memberId) ?? [];
    list.push({
      id: row.groupId,
      name: row.groupName,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categorySortOrder: row.categorySortOrder,
    });
    byMember.set(row.memberId, list);
  }

  return byMember;
}

export async function listMemberIdsInGroups(
  orgId: string,
  groupIds: string[],
): Promise<string[]> {
  if (groupIds.length === 0) return [];
  const rows = await db
    .select({ memberId: groupMemberships.memberId })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        activeMembership(),
        inArray(groupMemberships.groupId, groupIds),
      ),
    );
  return [...new Set(rows.map((r) => r.memberId))];
}

/**
 * `CASE status WHEN ... END` built from PAYMENT_STATUS_SORT_ORDER, so the
 * dashboard ordering lives in one place instead of being spelled out in SQL.
 * Sorting in Postgres (rather than after the fetch) keeps the ordering correct
 * for any future pagination.
 */
const statusRank = sql.join(
  [
    sql`case`,
    ...Object.entries(PAYMENT_STATUS_SORT_ORDER).map(
      ([status, rank]) => sql`when ${memberPayments.status} = ${status} then ${rank}`,
    ),
    sql`else ${Object.keys(PAYMENT_STATUS_SORT_ORDER).length} end`,
  ],
  sql` `,
);

/**
 * SQL mirror of `paymentInScope`: a row is in scope through its member or
 * its event. An empty allowlist is `false`, never "no filter".
 */
function paymentScopeCondition(scope: PaymentScope | undefined) {
  if (!scope || scope === "full") return undefined;
  return or(
    scope.memberIds.length
      ? inArray(memberPayments.memberId, [...scope.memberIds])
      : sql`false`,
    scope.eventIds.length
      ? inArray(memberPayments.eventId, [...scope.eventIds])
      : sql`false`,
  );
}

export async function listPaymentsForOrg(
  orgId: string,
  options?: {
    status?: MemberPaymentStatus[];
    type?: MemberPaymentType;
    periodLabel?: string;
    /** Payment scope (CONTEXT.md). Omitted means unrestricted. */
    scope?: PaymentScope;
  },
): Promise<PaymentRow[]> {
  const rows = await db
    .select({
      payment: memberPayments,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      guestName: eventResponses.guestName,
      eventTitle: events.title,
      eventSlug: events.slug,
    })
    .from(memberPayments)
    // Left joins: a guest's event payment has no member, and a paid event row
    // outlives its response (`response_id` is set null on delete).
    .leftJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
    .leftJoin(eventResponses, eq(memberPayments.responseId, eventResponses.id))
    .leftJoin(events, eq(memberPayments.eventId, events.id))
    .where(
      and(
        eq(memberPayments.orgId, orgId),
        options?.type ? eq(memberPayments.type, options.type) : undefined,
        options?.status?.length
          ? inArray(memberPayments.status, options.status)
          : undefined,
        options?.periodLabel
          ? eq(memberPayments.periodLabel, options.periodLabel)
          : undefined,
        paymentScopeCondition(options?.scope),
      ),
    )
    // Outstanding first, then the most pressing due date, with createdAt only
    // as a tiebreaker so the order is stable across renders.
    .orderBy(asc(statusRank), asc(memberPayments.dueAt), desc(memberPayments.createdAt));

  const groupsByMember = await getGroupsByMember(
    orgId,
    [...new Set(rows.flatMap((row) => row.payment.memberId ?? []))],
  );

  return rows.map((row) => ({
    ...row.payment,
    memberFirstName: row.firstName,
    memberLastName: row.lastName,
    memberEmail: row.email,
    memberName: payerName({ ...row, memberId: row.payment.memberId }),
    guestName: row.guestName,
    eventTitle: row.eventTitle,
    eventSlug: row.eventSlug,
    memberGroups: row.payment.memberId
      ? (groupsByMember.get(row.payment.memberId) ?? [])
      : [],
    canAct: canActOnPayment(options?.scope ?? "full", row.payment),
  }));
}

export type MemberPaymentRow = MemberPayment & {
  /** Set for event payments; the portal links the row to the event. */
  eventTitle: string | null;
  eventSlug: string | null;
};

export async function listPaymentsForMember(
  orgId: string,
  memberId: string,
): Promise<MemberPaymentRow[]> {
  const rows = await db
    .select({ payment: memberPayments, eventTitle: events.title, eventSlug: events.slug })
    .from(memberPayments)
    .leftJoin(events, eq(memberPayments.eventId, events.id))
    .where(
      and(
        eq(memberPayments.orgId, orgId),
        eq(memberPayments.memberId, memberId),
      ),
    )
    .orderBy(desc(memberPayments.createdAt));

  return rows.map((row) => ({ ...row.payment, eventTitle: row.eventTitle, eventSlug: row.eventSlug }));
}

/**
 * What the member currently owes — membership fees and event fees alike.
 * Deliberately not filtered by type: the portal strip answers "what do I owe",
 * and an unpaid camp fee is as much a debt as an unpaid membership fee.
 */
export async function getPendingPaymentsForMember(
  orgId: string,
  memberId: string,
): Promise<MemberPayment[]> {
  return db
    .select()
    .from(memberPayments)
    .where(
      and(
        eq(memberPayments.orgId, orgId),
        eq(memberPayments.memberId, memberId),
        inArray(memberPayments.status, ["pending", "overdue"]),
      ),
    )
    .orderBy(desc(memberPayments.dueAt));
}

export async function getPaymentStats(orgId: string): Promise<PaymentStats> {
  const statRows = await db
    .select({
      status: memberPayments.status,
      type: memberPayments.type,
      count: sql<number>`cast(count(*) as int)`,
      total: sum(memberPayments.amount),
    })
    .from(memberPayments)
    .where(
      and(
        eq(memberPayments.orgId, orgId),
        inArray(memberPayments.status, ["paid", "pending", "overdue", "refund_due"]),
      ),
    )
    .groupBy(memberPayments.status, memberPayments.type);

  const emptyBuckets = () => ({
    paid: { count: 0, totalCents: 0 },
    pending: { count: 0, totalCents: 0 },
    overdue: { count: 0, totalCents: 0 },
  });
  const byType: PaymentStats["byType"] = {
    membership_fee: emptyBuckets(),
    event: emptyBuckets(),
  };
  const totals = emptyBuckets();
  const refundDue: PaymentStatBucket = { count: 0, totalCents: 0 };
  for (const r of statRows) {
    const bucket = { count: r.count, totalCents: Number(r.total ?? 0) };
    if (r.status === "refund_due") {
      refundDue.count += bucket.count;
      refundDue.totalCents += bucket.totalCents;
      continue;
    }
    if (r.status !== "paid" && r.status !== "pending" && r.status !== "overdue") continue;
    byType[r.type][r.status] = bucket;
    totals[r.status].count += bucket.count;
    totals[r.status].totalCents += bucket.totalCents;
  }
  const { paid, pending, overdue } = totals;

  const eligible = paid.totalCents + pending.totalCents + overdue.totalCents;
  const collectionRate = eligible > 0 ? Math.round((paid.totalCents / eligible) * 100) : 0;
  const projectedIncomeCents = pending.totalCents + overdue.totalCents;

  return { paid, pending, overdue, refundDue, byType, collectionRate, projectedIncomeCents };
}

export type MemberOverdueFees = {
  overdueCount: number;
  overdueAmountCents: number;
  currency: string;
  /** Due date of the oldest unpaid overdue payment. */
  oldestDueAt: Date;
  /** Age of that oldest payment. Computed here so the table renders off one
   *  clock — the server's — rather than each viewer's browser. */
  daysOverdue: number;
};

/**
 * Overdue fees per member, derived from `member_payments`.
 *
 * This is the single source of truth for "is this member behind on their
 * fees". It used to be denormalized into `tenant_members.status` as
 * `suspended`, which collided with administrative suspension — a decision an
 * admin made — and was silently overwritten whenever a payment was settled.
 * Reading it here instead keeps the status column meaning exactly one thing,
 * and makes the question answerable for any set of payment rows rather than
 * only for "right now".
 */
export async function getOverdueFeesByMember(
  orgId: string,
  memberIds?: string[],
): Promise<Map<string, MemberOverdueFees>> {
  if (memberIds && memberIds.length === 0) return new Map();

  const rows = await db
    .select({
      // Never null here: membership-fee rows always carry a member.
      memberId: sql<string>`${memberPayments.memberId}`,
      count: sql<number>`cast(count(*) as int)`,
      total: sum(memberPayments.amount),
      // One currency per organization — groups cannot override it — so every
      // row in this group shares it and picking one is not a collapse.
      currency: sql<string>`min(${memberPayments.currency})`,
      oldestDueAt: sql<Date>`min(${memberPayments.dueAt})`,
    })
    .from(memberPayments)
    .where(
      and(
        eq(memberPayments.orgId, orgId),
        // "Behind on their fees" means membership fees; an unpaid camp fee
        // does not put the membership itself in question.
        eq(memberPayments.type, "membership_fee"),
        eq(memberPayments.status, "overdue"),
        memberIds?.length ? inArray(memberPayments.memberId, memberIds) : undefined,
      ),
    )
    .groupBy(memberPayments.memberId);

  const now = Date.now();

  return new Map(
    rows.map((row) => {
      const oldestDueAt = new Date(row.oldestDueAt);

      return [
        row.memberId,
        {
          overdueCount: row.count,
          overdueAmountCents: Number(row.total ?? 0),
          currency: row.currency,
          oldestDueAt,
          daysOverdue: Math.max(
            0,
            Math.floor((now - oldestDueAt.getTime()) / 86_400_000),
          ),
        },
      ];
    }),
  );
}

export type RefundDueRow = PaymentRow;

/**
 * Paid event payments whose RSVP is no longer a confirmed yes. Nothing moves
 * them on automatically; the dashboard pins them until an admin marks the
 * refund settled.
 */
export async function listRefundsDue(orgId: string): Promise<RefundDueRow[]> {
  return listPaymentsForOrg(orgId, { status: ["refund_due"] });
}
