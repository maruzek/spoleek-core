import { randomUUID } from "crypto";

import { and, eq, inArray, lt } from "drizzle-orm";

import { PaymentOverdueEmail } from "@/emails/payment-overdue-email";
import { PaymentRenewalHeadsupEmail } from "@/emails/payment-renewal-headsup-email";
import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import { getResendClient, getResendFromEmail } from "@/server/lib/email";

const RENEWAL_WINDOW_DAYS = 14;

async function generateVariableSymbol(orgId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const vs = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await db
      .select({ id: memberPayments.id })
      .from(memberPayments)
      .where(and(eq(memberPayments.orgId, orgId), eq(memberPayments.variableSymbol, vs)))
      .limit(1);
    if (existing.length === 0) return vs;
  }
  // Fallback: append timestamp suffix to guarantee uniqueness
  return String(Date.now()).slice(-6);
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

async function sendOverdueEmails(overdueIds: string[], orgEmailEnabled: boolean): Promise<void> {
  if (overdueIds.length === 0 || !orgEmailEnabled) return;

  try {
    const rows = await db
      .select({
        memberEmail: tenantMembers.email,
        memberFirstName: tenantMembers.firstName,
        memberLastName: tenantMembers.lastName,
        orgName: organizations.name,
        amount: memberPayments.amount,
        currency: memberPayments.currency,
        periodLabel: memberPayments.periodLabel,
        bankAccount: memberPayments.bankAccount,
        variableSymbol: memberPayments.variableSymbol,
        dueAt: memberPayments.dueAt,
      })
      .from(memberPayments)
      .innerJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
      .innerJoin(organizations, eq(memberPayments.orgId, organizations.id))
      .where(inArray(memberPayments.id, overdueIds));

    const resend = getResendClient();
    const from = getResendFromEmail();

    for (const row of rows) {
      if (!row.memberEmail) continue;
      const memberName =
        [row.memberFirstName, row.memberLastName].filter(Boolean).join(" ") || row.memberEmail;
      try {
        await resend.emails.send({
          from,
          to: [row.memberEmail],
          subject: `Action required: membership fee overdue — ${row.periodLabel}`,
          react: PaymentOverdueEmail({
            organizationName: row.orgName,
            memberName,
            periodLabel: row.periodLabel,
            amount: (row.amount / 100).toFixed(2),
            currency: row.currency,
            dueAt: row.dueAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            bankAccount: row.bankAccount,
            variableSymbol: row.variableSymbol,
          }),
        });
      } catch {
        // Individual email failures must not abort the batch
      }
    }
  } catch {
    // Email sending is non-critical — lifecycle continues
  }
}

async function sendRenewalHeadsupEmails(
  org: typeof organizations.$inferSelect,
  periodLabel: string,
): Promise<void> {
  try {
    const feeAmount = org.membershipFeeAmount;
    const feeCurrency = org.membershipFeeCurrency;
    if (!feeAmount || !feeCurrency) return;

    // Find active members who don't yet have a payment for this period
    const membersWithPayment = await db
      .select({ memberId: memberPayments.memberId })
      .from(memberPayments)
      .where(
        and(
          eq(memberPayments.orgId, org.id),
          eq(memberPayments.periodLabel, periodLabel),
        ),
      );

    const alreadyHasPayment = new Set(membersWithPayment.map((r) => r.memberId));

    const activeMembers = await db
      .select({
        id: tenantMembers.id,
        email: tenantMembers.email,
        firstName: tenantMembers.firstName,
        lastName: tenantMembers.lastName,
      })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.orgId, org.id),
          eq(tenantMembers.status, "active"),
        ),
      );

    const renewalDate = new Date(
      new Date().getFullYear(),
      org.membershipRenewalMonth! - 1,
      org.membershipRenewalDay!,
    ).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    const resend = getResendClient();
    const from = getResendFromEmail();

    for (const member of activeMembers) {
      if (!member.email || alreadyHasPayment.has(member.id)) continue;
      const memberName =
        [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
      try {
        await resend.emails.send({
          from,
          to: [member.email],
          subject: `Membership renewal coming up — ${periodLabel}`,
          react: PaymentRenewalHeadsupEmail({
            organizationName: org.name,
            memberName,
            periodLabel,
            renewalDate,
            amount: (feeAmount / 100).toFixed(2),
            currency: feeCurrency,
            bankAccount: org.membershipFeeBankAccount,
          }),
        });
      } catch {
        // Individual email failures must not abort the batch
      }
    }
  } catch {
    // Email sending is non-critical — lifecycle continues
  }
}

function isXDaysBeforeRenewal(
  renewalMonth: number,
  renewalDay: number,
  today: Date,
  daysBefore: number,
): boolean {
  const currentYear = today.getFullYear();
  const candidates = [
    new Date(currentYear, renewalMonth - 1, renewalDay),
    new Date(currentYear + 1, renewalMonth - 1, renewalDay),
  ];
  return candidates.some((renewalDate) => {
    const headsupDate = new Date(renewalDate);
    headsupDate.setDate(headsupDate.getDate() - daysBefore);
    return (
      headsupDate.getFullYear() === today.getFullYear() &&
      headsupDate.getMonth() === today.getMonth() &&
      headsupDate.getDate() === today.getDate()
    );
  });
}

export async function generatePaymentForMember(
  memberId: string,
  orgId: string,
): Promise<{ created: boolean }> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (
    !org ||
    org.membershipManagementMode !== "periodic_renewal" ||
    !org.membershipFeeEnabled ||
    !org.membershipRenewalMonth ||
    !org.membershipRenewalDay
  ) {
    return { created: false };
  }

  const today = new Date();
  const periodLabel = getPeriodLabel(org.membershipRenewalMonth, org.membershipRenewalDay, today);

  const [groupFee] = await db
    .select({
      memberId: groupMemberships.memberId,
      groupId: groupMemberships.groupId,
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
        eq(groupMemberships.orgId, orgId),
        eq(groupMemberships.memberId, memberId),
        eq(groupCategories.managesMembershipFees, true),
        eq(groups.isActive, true),
      ),
    )
    .orderBy(groupMemberships.createdAt)
    .limit(1);

  let payment: typeof memberPayments.$inferInsert;

  if (groupFee?.feeAmount != null && groupFee.feeCurrency) {
    const groupPeriodLabel =
      groupFee.feeRenewalMonth && groupFee.feeRenewalDay
        ? getPeriodLabel(groupFee.feeRenewalMonth, groupFee.feeRenewalDay, today)
        : periodLabel;
    const windowDays = groupFee.feePaymentWindowDays ?? org.membershipFeePaymentWindowDays;
    const dueAt = new Date(today);
    dueAt.setDate(dueAt.getDate() + windowDays);

    payment = {
      id: randomUUID(),
      orgId,
      memberId,
      type: "membership_fee",
      status: "pending",
      amount: groupFee.feeAmount,
      currency: groupFee.feeCurrency,
      bankAccount: groupFee.feeBankAccount,
      periodLabel: groupPeriodLabel,
      periodKey: `${groupPeriodLabel}:grp:${groupFee.groupId}`,
      variableSymbol: await generateVariableSymbol(orgId),
      dueAt,
      createdAt: today,
      updatedAt: today,
    };
  } else {
    if (!org.membershipFeeAmount || !org.membershipFeeCurrency) {
      return { created: false };
    }
    const dueAt = new Date(today);
    dueAt.setDate(dueAt.getDate() + org.membershipFeePaymentWindowDays);

    payment = {
      id: randomUUID(),
      orgId,
      memberId,
      type: "membership_fee",
      status: "pending",
      amount: org.membershipFeeAmount,
      currency: org.membershipFeeCurrency,
      bankAccount: org.membershipFeeBankAccount,
      periodLabel,
      periodKey: `${periodLabel}:org:${orgId}`,
      variableSymbol: await generateVariableSymbol(orgId),
      dueAt,
      createdAt: today,
      updatedAt: today,
    };
  }

  const inserted = await db
    .insert(memberPayments)
    .values(payment)
    .onConflictDoNothing()
    .returning({ id: memberPayments.id });

  return { created: inserted.length > 0 };
}

export async function generateMembershipPayments(): Promise<GenerateResult> {
  const result: GenerateResult = {
    orgsProcessed: 0,
    paymentsCreated: 0,
    paymentsSkipped: 0,
    errors: [],
  };

  const today = new Date();

  // Mark overdue and collect IDs + memberIds for suspension + notification emails
  const nowOverdue = await db
    .update(memberPayments)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(and(eq(memberPayments.status, "pending"), lt(memberPayments.dueAt, today)))
    .returning({ id: memberPayments.id, memberId: memberPayments.memberId, orgId: memberPayments.orgId });

  // Suspend active members whose payment just became overdue
  if (nowOverdue.length > 0) {
    const overdueMemberIds = [...new Set(nowOverdue.map((r) => r.memberId))];
    await db
      .update(tenantMembers)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(
        and(
          inArray(tenantMembers.id, overdueMemberIds),
          eq(tenantMembers.status, "active"),
        ),
      );
  }

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

  // Fire-and-forget overdue emails grouped by org toggle — don't block payment generation
  if (nowOverdue.length > 0) {
    const overdueByOrg = new Map<string, string[]>();
    for (const r of nowOverdue) {
      const ids = overdueByOrg.get(r.orgId) ?? [];
      ids.push(r.id);
      overdueByOrg.set(r.orgId, ids);
    }
    const orgToggles = new Map(eligibleOrgs.map((o) => [o.id, o.emailNotifyOverdue]));
    for (const [orgId, ids] of overdueByOrg) {
      void sendOverdueEmails(ids, orgToggles.get(orgId) ?? true);
    }
  }

  for (const org of eligibleOrgs) {
    if (!org.membershipRenewalMonth || !org.membershipRenewalDay) {
      continue;
    }

    // Send renewal head-up emails if today is the configured number of days before renewal
    if (
      org.emailNotifyRenewalHeadsup &&
      isXDaysBeforeRenewal(
        org.membershipRenewalMonth,
        org.membershipRenewalDay,
        today,
        org.emailNotifyRenewalHeadsupDaysBefore,
      )
    ) {
      const periodLabel = getPeriodLabel(org.membershipRenewalMonth, org.membershipRenewalDay, today);
      void sendRenewalHeadsupEmails(org, periodLabel);
    }

    if (!isInRenewalWindow(org.membershipRenewalMonth, org.membershipRenewalDay, today)) {
      continue;
    }

    result.orgsProcessed++;

    try {
      const periodLabel = getPeriodLabel(org.membershipRenewalMonth, org.membershipRenewalDay, today);

      // Load active members (suspended members are excluded — they must pay first)
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

      // Build payment records to insert — VS uniqueness checked per-org above
      const paymentsToInsert = await Promise.all(
        activeMembers.map(async (member) => {
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
              variableSymbol: await generateVariableSymbol(org.id),
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
            variableSymbol: await generateVariableSymbol(org.id),
            dueAt,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }),
      );

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
