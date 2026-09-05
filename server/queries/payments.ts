import { and, asc, desc, eq, inArray, sql, sum } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupMemberships,
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

export type PaymentRow = MemberPayment & {
  memberFirstName: string | null;
  memberLastName: string | null;
  memberEmail: string | null;
  memberName: string;
};

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
    .orderBy(desc(memberPayments.createdAt));

  return rows.map((row) => ({
    ...row.payment,
    memberFirstName: row.firstName,
    memberLastName: row.lastName,
    memberEmail: row.email,
    memberName: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || "Unknown",
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
