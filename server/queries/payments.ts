import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupMemberships,
  memberPayments,
  tenantMembers,
  type MemberPayment,
  type MemberPaymentStatus,
} from "@/server/db/schema";

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
