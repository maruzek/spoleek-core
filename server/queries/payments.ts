import { and, asc, desc, eq, inArray, sql, sum } from "drizzle-orm";

import { PAYMENT_STATUS_SORT_ORDER } from "@/lib/payments";
import { db } from "@/server/db";
import {
  groupMemberships,
  groups,
  memberPayments,
  tenantMembers,
  type MemberPayment,
  type MemberPaymentStatus,
} from "@/server/db/schema";

export type PaymentStats = {
  paid: { count: number; totalCents: number };
  pending: { count: number; totalCents: number };
  overdue: { count: number; totalCents: number };
  collectionRate: number;
  projectedIncomeCents: number;
  debtAging: Array<{
    memberId: string;
    memberName: string;
    periodLabel: string;
    amountCents: number;
    currency: string;
    dueAt: Date;
    daysOverdue: number;
  }>;
};

export type PaymentMemberGroup = { id: string; name: string };

export type PaymentRow = MemberPayment & {
  memberFirstName: string | null;
  memberLastName: string | null;
  memberEmail: string | null;
  memberName: string;
  /** Every group the payer belongs to. Drives the group filter on the
   *  dashboard; a member can sit in several, so this is a list, not a field. */
  memberGroups: PaymentMemberGroup[];
};

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
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        inArray(groupMemberships.memberId, memberIds),
      ),
    )
    .orderBy(asc(groups.name));

  const byMember = new Map<string, PaymentMemberGroup[]>();

  for (const row of rows) {
    const list = byMember.get(row.memberId) ?? [];
    list.push({ id: row.groupId, name: row.groupName });
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

export async function listPaymentsForOrg(
  orgId: string,
  options?: {
    status?: MemberPaymentStatus[];
    periodLabel?: string;
    memberIds?: string[];
  },
): Promise<PaymentRow[]> {
  const rows = await db
    .select({
      payment: memberPayments,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
    })
    .from(memberPayments)
    .innerJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
    .where(
      and(
        eq(memberPayments.orgId, orgId),
        options?.status?.length
          ? inArray(memberPayments.status, options.status)
          : undefined,
        options?.periodLabel
          ? eq(memberPayments.periodLabel, options.periodLabel)
          : undefined,
        options?.memberIds?.length
          ? inArray(memberPayments.memberId, options.memberIds)
          : undefined,
      ),
    )
    // Outstanding first, then the most pressing due date, with createdAt only
    // as a tiebreaker so the order is stable across renders.
    .orderBy(asc(statusRank), asc(memberPayments.dueAt), desc(memberPayments.createdAt));

  const groupsByMember = await getGroupsByMember(
    orgId,
    [...new Set(rows.map((row) => row.payment.memberId))],
  );

  return rows.map((row) => ({
    ...row.payment,
    memberFirstName: row.firstName,
    memberLastName: row.lastName,
    memberEmail: row.email,
    memberName: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || "Unknown",
    memberGroups: groupsByMember.get(row.payment.memberId) ?? [],
  }));
}

export async function listPaymentsForMember(
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
      ),
    )
    .orderBy(desc(memberPayments.createdAt));
}

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
      count: sql<number>`cast(count(*) as int)`,
      total: sum(memberPayments.amount),
    })
    .from(memberPayments)
    .where(
      and(
        eq(memberPayments.orgId, orgId),
        inArray(memberPayments.status, ["paid", "pending", "overdue"]),
      ),
    )
    .groupBy(memberPayments.status);

  const byStatus = Object.fromEntries(
    statRows.map((r) => [r.status, { count: r.count, totalCents: Number(r.total ?? 0) }]),
  ) as Partial<Record<MemberPaymentStatus, { count: number; totalCents: number }>>;

  const paid = byStatus.paid ?? { count: 0, totalCents: 0 };
  const pending = byStatus.pending ?? { count: 0, totalCents: 0 };
  const overdue = byStatus.overdue ?? { count: 0, totalCents: 0 };

  const eligible = paid.totalCents + pending.totalCents + overdue.totalCents;
  const collectionRate = eligible > 0 ? Math.round((paid.totalCents / eligible) * 100) : 0;
  const projectedIncomeCents = pending.totalCents + overdue.totalCents;

  const now = new Date();
  const overdueRows = await db
    .select({
      memberId: memberPayments.memberId,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      periodLabel: memberPayments.periodLabel,
      amount: memberPayments.amount,
      currency: memberPayments.currency,
      dueAt: memberPayments.dueAt,
    })
    .from(memberPayments)
    .innerJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
    .where(and(eq(memberPayments.orgId, orgId), eq(memberPayments.status, "overdue")))
    .orderBy(asc(memberPayments.dueAt));

  const debtAging = overdueRows.map((r) => ({
    memberId: r.memberId,
    memberName: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "Unknown",
    periodLabel: r.periodLabel,
    amountCents: r.amount,
    currency: r.currency,
    dueAt: r.dueAt,
    daysOverdue: Math.floor((now.getTime() - r.dueAt.getTime()) / (1000 * 60 * 60 * 24)),
  }));

  return { paid, pending, overdue, collectionRate, projectedIncomeCents, debtAging };
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
      memberId: memberPayments.memberId,
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
