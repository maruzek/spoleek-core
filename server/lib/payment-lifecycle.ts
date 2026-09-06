import { and, eq, inArray, lt } from "drizzle-orm";

import { PaymentOverdueEmail } from "@/emails/payment-overdue-email";
import { PaymentRenewalHeadsupEmail } from "@/emails/payment-renewal-headsup-email";
import { resolveMembershipPeriod } from "@/lib/membership-period";
import { feeAmountToDecimal } from "@/lib/payments";
import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import type { MembershipPeriodMode } from "@/server/db/schema";
import { getResendClient, getResendFromEmail } from "@/server/lib/email";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import { formatLongDate } from "@/lib/format";

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

/**
 * The label stamped onto a payment's `period_label` and `period_key`.
 *
 * Delegates to `resolveMembershipPeriod` so payments and the yearly member
 * report always name the period identically — the report joins members to
 * payments on this string, and two functions that merely happen to format the
 * same way would drift the first time one of them changed.
 */
function getPeriodLabel(
  mode: MembershipPeriodMode,
  renewalMonth: number,
  renewalDay: number,
  today: Date,
): string {
  return resolveMembershipPeriod({ mode, renewalMonth, renewalDay, today }).label;
}

/** The group columns that may override the organization's fee settings. */
export type GroupFeeOverrides = {
  groupId: string;
  feeAmount: number | null;
  feeBankAccount: string | null;
  feePaymentWindowDays: number | null;
  feeRenewalMonth: number | null;
  feeRenewalDay: number | null;
};

export type ResolvedFee = {
  amount: number;
  currency: string;
  bankAccount: string | null;
  periodLabel: string;
  periodKey: string;
  dueAt: Date;
};

/**
 * Resolves what a member owes, merging a fee-managing group's overrides over
 * the organization defaults.
 *
 * The merge is per field, matching what the group form promises ("Leave fields
 * empty to use the organization defaults. Fill in only the values this group
 * should override."). The previous all-or-nothing check meant a group that set
 * only an amount silently dropped the org's IBAN.
 *
 * Currency is deliberately not overridable: it is one value per organization.
 * A group billing a second currency would make the yearly report's per-group
 * totals sum two currencies under one label.
 *
 * Renewal month and day move as a pair because the group form validates them
 * that way — half a date is never meaningful.
 */
export function resolveMembershipFee(
  org: typeof organizations.$inferSelect,
  groupFee: GroupFeeOverrides | null | undefined,
  today: Date,
): ResolvedFee | null {
  const amount = groupFee?.feeAmount ?? org.membershipFeeAmount;
  const currency = org.membershipFeeCurrency;

  if (!amount || !currency) return null;

  const hasGroupRenewal =
    groupFee?.feeRenewalMonth != null && groupFee.feeRenewalDay != null;
  const renewalMonth = hasGroupRenewal
    ? groupFee.feeRenewalMonth!
    : org.membershipRenewalMonth!;
  const renewalDay = hasGroupRenewal
    ? groupFee.feeRenewalDay!
    : org.membershipRenewalDay!;

  const windowDays =
    groupFee?.feePaymentWindowDays ?? org.membershipFeePaymentWindowDays;
  const dueAt = new Date(today);
  dueAt.setDate(dueAt.getDate() + windowDays);

  const periodLabel = getPeriodLabel(
    org.membershipPeriodMode,
    renewalMonth,
    renewalDay,
    today,
  );

  // A group that overrides nothing bills exactly the org fee, so it keeps the
  // org period key. Scoping it to the group regardless would let the same
  // member accumulate an :org: row and a :grp: row for one period.
  const overridesAnything =
    groupFee != null &&
    (groupFee.feeAmount != null ||
      groupFee.feeBankAccount != null ||
      groupFee.feePaymentWindowDays != null ||
      hasGroupRenewal);

  return {
    amount,
    currency,
    bankAccount: groupFee?.feeBankAccount ?? org.membershipFeeBankAccount,
    periodLabel,
    periodKey: overridesAnything
      ? `${periodLabel}:grp:${groupFee.groupId}`
      : `${periodLabel}:org:${org.id}`,
    dueAt,
  };
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
        memberWorkspaceEmail: tenantMembers.workspaceUserEmail,
        memberPreferredEmail: tenantMembers.preferredEmail,
        memberFirstName: tenantMembers.firstName,
        memberLastName: tenantMembers.lastName,
        orgName: organizations.name,
        defaultEmailPreference: organizations.defaultEmailPreference,
        workspaceModuleEnabled: organizations.workspaceModuleEnabled,
        workspaceConnectedAt: organizations.workspaceConnectedAt,
        workspaceDomain: organizations.workspaceDomain,
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
      const toEmail = resolveMemberEmailForOrg({
        member: {
          email: row.memberEmail,
          workspaceUserEmail: row.memberWorkspaceEmail,
          preferredEmail: row.memberPreferredEmail,
        },
        organization: {
          defaultEmailPreference: row.defaultEmailPreference,
          workspaceModuleEnabled: row.workspaceModuleEnabled,
          workspaceConnectedAt: row.workspaceConnectedAt,
          workspaceDomain: row.workspaceDomain,
        },
      });

      if (!toEmail) continue;
      const memberName =
        [row.memberFirstName, row.memberLastName].filter(Boolean).join(" ") || toEmail;
      try {
        await resend.emails.send({
          from,
          to: [toEmail],
          subject: `Action required: membership fee overdue — ${row.periodLabel}`,
          react: PaymentOverdueEmail({
            organizationName: row.orgName,
            memberName,
            periodLabel: row.periodLabel,
            amount: feeAmountToDecimal(row.amount),
            currency: row.currency,
            dueAt: formatLongDate(row.dueAt),
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
        workspaceUserEmail: tenantMembers.workspaceUserEmail,
        preferredEmail: tenantMembers.preferredEmail,
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

    const renewalDate = formatLongDate(
      new Date(
        new Date().getFullYear(),
        org.membershipRenewalMonth! - 1,
        org.membershipRenewalDay!,
      ),
    );

    const resend = getResendClient();
    const from = getResendFromEmail();

    for (const member of activeMembers) {
      if (alreadyHasPayment.has(member.id)) continue;

      const toEmail = resolveMemberEmailForOrg({
        member: {
          email: member.email,
          workspaceUserEmail: member.workspaceUserEmail,
          preferredEmail: member.preferredEmail,
        },
        organization: org,
      });

      if (!toEmail) continue;
      const memberName =
        [member.firstName, member.lastName].filter(Boolean).join(" ") || toEmail;
      try {
        await resend.emails.send({
          from,
          to: [toEmail],
          subject: `Membership renewal coming up — ${periodLabel}`,
          react: PaymentRenewalHeadsupEmail({
            organizationName: org.name,
            memberName,
            periodLabel,
            renewalDate,
            amount: feeAmountToDecimal(feeAmount),
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

  const [groupFee] = await db
    .select({
      memberId: groupMemberships.memberId,
      groupId: groupMemberships.groupId,
      feeAmount: groups.feeAmount,
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

  const fee = resolveMembershipFee(org, groupFee, today);

  if (!fee) {
    return { created: false };
  }

  const payment: typeof memberPayments.$inferInsert = {
    orgId,
    memberId,
    type: "membership_fee",
    status: "pending",
    amount: fee.amount,
    currency: fee.currency,
    bankAccount: fee.bankAccount,
    periodLabel: fee.periodLabel,
    periodKey: fee.periodKey,
    variableSymbol: await generateVariableSymbol(orgId),
    dueAt: fee.dueAt,
    createdAt: today,
    updatedAt: today,
  };

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

  // Mark overdue and collect IDs for the notification emails.
  //
  // Deliberately does NOT touch tenant_members.status. Having overdue fees is
  // derived state — it is `exists(member_payments where status = 'overdue')`
  // and nothing else. Writing it into the status column conflated it with
  // administrative suspension, which is a decision a human made: a member
  // suspended by an admin who then settled a fee was silently reactivated,
  // erasing that decision with no audit trail. It is now read from these rows
  // wherever it is displayed (see getOverdueFeesByMember).
  const nowOverdue = await db
    .update(memberPayments)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(and(eq(memberPayments.status, "pending"), lt(memberPayments.dueAt, today)))
    .returning({ id: memberPayments.id, memberId: memberPayments.memberId, orgId: memberPayments.orgId });

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
      const periodLabel = getPeriodLabel(
        org.membershipPeriodMode,
        org.membershipRenewalMonth,
        org.membershipRenewalDay,
        today,
      );
      void sendRenewalHeadsupEmails(org, periodLabel);
    }

    if (!isInRenewalWindow(org.membershipRenewalMonth, org.membershipRenewalDay, today)) {
      continue;
    }

    result.orgsProcessed++;

    try {
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
          const fee = resolveMembershipFee(
            org,
            memberGroupMap.get(member.id),
            today,
          );

          if (!fee) return null;

          return {
            orgId: org.id,
            memberId: member.id,
            type: "membership_fee" as const,
            status: "pending" as const,
            amount: fee.amount,
            currency: fee.currency,
            bankAccount: fee.bankAccount,
            periodLabel: fee.periodLabel,
            periodKey: fee.periodKey,
            variableSymbol: await generateVariableSymbol(org.id),
            dueAt: fee.dueAt,
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
