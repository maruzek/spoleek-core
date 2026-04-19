import { randomUUID } from "crypto";

import { and, eq, inArray, lt } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  organizations,
  tenantMembers,
} from "@/server/db/schema";

const RENEWAL_WINDOW_DAYS = 14;

function generateVariableSymbol(): string {
  // 6-digit numeric VS — unique enough for typical org sizes, easy to read aloud
  return String(Math.floor(100000 + Math.random() * 900000));
}

type GenerateResult = {
  orgsProcessed: number;
  paymentsCreated: number;
  paymentsSkipped: number;
  errors: Array<{ orgId: string; error: string }>;
};

function getPeriodLabel(renewalMonth: number, renewalDay: number, today: Date): string {
  const currentYear = today.getFullYear();
  const renewalThisYear = new Date(currentYear, renewalMonth - 1, renewalDay);
  const periodStartYear = today >= renewalThisYear ? currentYear : currentYear - 1;
  return `${periodStartYear}/${periodStartYear + 1}`;
}

function isInRenewalWindow(renewalMonth: number, renewalDay: number, today: Date): boolean {
  const currentYear = today.getFullYear();
  const renewalThisYear = new Date(currentYear, renewalMonth - 1, renewalDay);
  const windowEnd = new Date(renewalThisYear);
  windowEnd.setDate(windowEnd.getDate() + RENEWAL_WINDOW_DAYS);

  // Also check previous year's window (handles year-boundary cases)
  const renewalPrevYear = new Date(currentYear - 1, renewalMonth - 1, renewalDay);
  const prevWindowEnd = new Date(renewalPrevYear);
  prevWindowEnd.setDate(prevWindowEnd.getDate() + RENEWAL_WINDOW_DAYS);

  return (
    (today >= renewalThisYear && today <= windowEnd) ||
    (today >= renewalPrevYear && today <= prevWindowEnd)
  );
}

export async function generateMembershipPayments(): Promise<GenerateResult> {
  const result: GenerateResult = {
    orgsProcessed: 0,
    paymentsCreated: 0,
    paymentsSkipped: 0,
    errors: [],
  };

  const today = new Date();

  // First: mark overdue payments unconditionally
  await db
    .update(memberPayments)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(and(eq(memberPayments.status, "pending"), lt(memberPayments.dueAt, today)));

  // Load orgs eligible for payment generation
  const eligibleOrgs = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.membershipManagementMode, "periodic_renewal"),
        eq(organizations.membershipFeeEnabled, true),
      ),
    );

  for (const org of eligibleOrgs) {
    if (!org.membershipRenewalMonth || !org.membershipRenewalDay) {
      continue;
    }

    if (!isInRenewalWindow(org.membershipRenewalMonth, org.membershipRenewalDay, today)) {
      continue;
    }

    result.orgsProcessed++;

    try {
      const periodLabel = getPeriodLabel(org.membershipRenewalMonth, org.membershipRenewalDay, today);

      // Load active members
      const activeMembers = await db
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.orgId, org.id),
            eq(tenantMembers.status, "active"),
          ),
        );

      if (activeMembers.length === 0) continue;

      const memberIds = activeMembers.map((m) => m.id);

      // Load fee-managing group memberships for these members
      const feeGroupMemberships = await db
        .select({
          memberId: groupMemberships.memberId,
          groupId: groupMemberships.groupId,
          createdAt: groupMemberships.createdAt,
          feeAmount: groups.feeAmount,
          feeCurrency: groups.feeCurrency,
          feeBankAccount: groups.feeBankAccount,
          feePaymentWindowDays: groups.feePaymentWindowDays,
          feeRenewalMonth: groups.feeRenewalMonth,
          feeRenewalDay: groups.feeRenewalDay,
        })
        .from(groupMemberships)
        .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
        .innerJoin(groupCategories, eq(groups.categoryId, groupCategories.id))
        .where(
          and(
            eq(groupMemberships.orgId, org.id),
            inArray(groupMemberships.memberId, memberIds),
            eq(groupCategories.managesMembershipFees, true),
            eq(groups.isActive, true),
          ),
        )
        .orderBy(groupMemberships.createdAt);

      // Build a map: memberId -> first fee-managing group membership
      const memberGroupMap = new Map<
        string,
        (typeof feeGroupMemberships)[number]
      >();
      for (const gm of feeGroupMemberships) {
        if (!memberGroupMap.has(gm.memberId)) {
          memberGroupMap.set(gm.memberId, gm);
        }
      }

      // Build payment records to insert
      const paymentsToInsert = activeMembers.map((member) => {
        const groupFee = memberGroupMap.get(member.id);

        if (groupFee?.feeAmount != null && groupFee.feeCurrency) {
          const groupPeriodLabel = groupFee.feeRenewalMonth && groupFee.feeRenewalDay
            ? getPeriodLabel(groupFee.feeRenewalMonth, groupFee.feeRenewalDay, today)
            : periodLabel;
          const windowDays = groupFee.feePaymentWindowDays ?? org.membershipFeePaymentWindowDays;
          const dueAt = new Date(today);
          dueAt.setDate(dueAt.getDate() + windowDays);

          return {
            id: randomUUID(),
            orgId: org.id,
            memberId: member.id,
            type: "membership_fee" as const,
            status: "pending" as const,
            amount: groupFee.feeAmount,
            currency: groupFee.feeCurrency,
            bankAccount: groupFee.feeBankAccount,
            periodLabel: groupPeriodLabel,
            periodKey: `${groupPeriodLabel}:grp:${groupFee.groupId}`,
            variableSymbol: generateVariableSymbol(),
            dueAt,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }

        // Org-level fee
        if (!org.membershipFeeAmount || !org.membershipFeeCurrency) return null;

        const dueAt = new Date(today);
        dueAt.setDate(dueAt.getDate() + org.membershipFeePaymentWindowDays);

        return {
          id: randomUUID(),
          orgId: org.id,
          memberId: member.id,
          type: "membership_fee" as const,
          status: "pending" as const,
          amount: org.membershipFeeAmount,
          currency: org.membershipFeeCurrency,
          bankAccount: org.membershipFeeBankAccount,
          periodLabel,
          periodKey: `${periodLabel}:org:${org.id}`,
          variableSymbol: generateVariableSymbol(),
          dueAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      const validPayments = paymentsToInsert.filter((p) => p !== null);

      if (validPayments.length === 0) continue;

      const inserted = await db
        .insert(memberPayments)
        .values(validPayments)
        .onConflictDoNothing()
        .returning({ id: memberPayments.id });

      result.paymentsCreated += inserted.length;
      result.paymentsSkipped += validPayments.length - inserted.length;
    } catch (error) {
      result.errors.push({
        orgId: org.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
