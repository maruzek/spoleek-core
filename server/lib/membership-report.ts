import { and, asc, eq, inArray, notExists, or, sql } from "drizzle-orm";

import {
  resolveConfirmDueDate,
  resolveMembershipPeriod,
} from "@/lib/membership-period";
import { db } from "@/server/db";
import {
  groupCategories,
  groupMemberships,
  groups,
  memberPayments,
  membershipReportGroups,
  membershipReportMembers,
  membershipReports,
  organizations,
  tenantMembers,
  type MembershipReportConfirmationBasis,
} from "@/server/db/schema";

/**
 * A payment confirms membership when the money arrived, or when an admin
 * decided none was owed.
 *
 * `waived` is deliberately not folded into `paid`: an honorary or hardship
 * member is a decision someone made, and the board reads "34 paid, 2 waived"
 * rather than a flat 36. Every other cancellation reason — duplicate, admin
 * error — means the payment should never have existed and confirms nothing.
 */
export function getConfirmationBasis(payment: {
  status: string;
  cancellationReason: string | null;
}): MembershipReportConfirmationBasis | null {
  if (payment.status === "paid") return "paid";
  if (payment.status === "cancelled" && payment.cancellationReason === "waived") {
    return "waived";
  }
  return null;
}

/** The category whose groups are the report's rows, or null when none is flagged. */
export async function getFeeManagingCategory(orgId: string) {
  const [category] = await db
    .select({ id: groupCategories.id, name: groupCategories.name })
    .from(groupCategories)
    .where(
      and(
        eq(groupCategories.orgId, orgId),
        eq(groupCategories.isActive, true),
        eq(groupCategories.managesMembershipFees, true),
      ),
    )
    .orderBy(asc(groupCategories.sortOrder))
    .limit(1);

  return category ?? null;
}

/**
 * Which report row each member belongs under.
 *
 * A category set to `multiple` lets a member sit in two groups at once, and
 * counting them under both would make the board's total larger than the
 * organization. One group wins — the lowest `sortOrder`, then the oldest
 * membership — so the choice is stable across runs rather than depending on
 * row order.
 */
async function getReportGroupIdByMember(
  orgId: string,
  categoryId: string,
  memberIds?: string[],
): Promise<Map<string, string>> {
  if (memberIds && memberIds.length === 0) return new Map();

  const rows = await db
    .select({
      memberId: groupMemberships.memberId,
      groupId: groupMemberships.groupId,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(
      and(
        eq(groupMemberships.orgId, orgId),
        eq(groups.categoryId, categoryId),
        eq(groups.isActive, true),
        memberIds?.length
          ? inArray(groupMemberships.memberId, memberIds)
          : undefined,
      ),
    )
    .orderBy(asc(groups.sortOrder), asc(groupMemberships.createdAt));

  const byMember = new Map<string, string>();
  for (const row of rows) {
    if (!byMember.has(row.memberId)) byMember.set(row.memberId, row.groupId);
  }
  return byMember;
}

/** The payments that confirm membership for one period. */
function confirmedPaymentsFilter(orgId: string, periodLabel: string) {
  return and(
    eq(memberPayments.orgId, orgId),
    eq(memberPayments.periodLabel, periodLabel),
    or(
      eq(memberPayments.status, "paid"),
      and(
        eq(memberPayments.status, "cancelled"),
        eq(memberPayments.cancellationReason, "waived"),
      ),
    ),
  );
}

export type UnassignedConfirmedMember = {
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  basis: MembershipReportConfirmationBasis;
};

/**
 * Members who confirmed for the period but belong to no group that reports.
 *
 * Both write paths resolve a member to a report row through the fee-managing
 * category and quietly drop the ones that resolve to nothing. That is the only
 * sane thing for a write to do — there is no row to write them to — but it also
 * means the board's total silently excludes them. Counting them here is what
 * makes the omission visible, and the fix is to put the member in a region.
 */
export async function listUnassignedConfirmedMembers(
  orgId: string,
  periodLabel: string,
): Promise<UnassignedConfirmedMember[]> {
  const category = await getFeeManagingCategory(orgId);
  if (!category) return [];

  const rows = await db
    .select({
      memberId: memberPayments.memberId,
      status: memberPayments.status,
      cancellationReason: memberPayments.cancellationReason,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
    })
    .from(memberPayments)
    .innerJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
    .where(
      and(
        confirmedPaymentsFilter(orgId, periodLabel),
        notExists(
          db
            .select({ one: sql`1` })
            .from(groupMemberships)
            .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
            .where(
              and(
                eq(groupMemberships.memberId, memberPayments.memberId),
                eq(groups.categoryId, category.id),
                eq(groups.isActive, true),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(tenantMembers.lastName), asc(tenantMembers.firstName));

  // A member with both a paid and a waived row for one period would otherwise
  // be named twice.
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    const basis = getConfirmationBasis(row);
    if (!basis || seen.has(row.memberId)) return [];
    seen.add(row.memberId);
    return [
      {
        memberId: row.memberId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        basis,
      },
    ];
  });
}

/**
 * Recomputes the cached counts on one group row from its member rows.
 *
 * The counts are denormalized so the board table can list every group without
 * a per-row aggregate. That is only safe because the rows freeze at submit —
 * call this after any write to `membership_report_members`.
 */
export async function recalculateReportGroupCounts(reportGroupId: string) {
  const [reportRow] = await db
    .select({ currency: membershipReports.currency })
    .from(membershipReportGroups)
    .innerJoin(
      membershipReports,
      eq(membershipReportGroups.reportId, membershipReports.id),
    )
    .where(eq(membershipReportGroups.id, reportGroupId))
    .limit(1);

  if (!reportRow) throw new Error("Report group not found.");

  const currency = reportRow.currency;

  const [totals] = await db
    .select({
      memberCount: sql<number>`cast(count(*) as int)`,
      paidCount: sql<number>`cast(count(*) filter (where ${membershipReportMembers.confirmationBasis} = 'paid') as int)`,
      waivedCount: sql<number>`cast(count(*) filter (where ${membershipReportMembers.confirmationBasis} = 'waived') as int)`,
      feeTotalCents: sql<number>`cast(coalesce(sum(${membershipReportMembers.feeAmountCents}), 0) as int)`,
      // The total carries one currency label, so a row in another currency
      // would be summed under the wrong one. Currency is organization-wide and
      // not overridable, so this can only mean a bug — refuse rather than
      // publish a number that is quietly the sum of two currencies.
      foreignCurrencyCount: sql<number>`cast(count(*) filter (where ${membershipReportMembers.currency} is not null and ${membershipReportMembers.currency} is distinct from ${currency}) as int)`,
    })
    .from(membershipReportMembers)
    .where(
      and(
        eq(membershipReportMembers.reportGroupId, reportGroupId),
        eq(membershipReportMembers.included, true),
        eq(membershipReportMembers.pendingAddition, false),
      ),
    );

  if (currency && (totals?.foreignCurrencyCount ?? 0) > 0) {
    throw new Error(
      `Report group ${reportGroupId} has ${totals!.foreignCurrencyCount} member rows in a currency other than ${currency}.`,
    );
  }

  await db
    .update(membershipReportGroups)
    .set({
      memberCount: totals?.memberCount ?? 0,
      paidCount: totals?.paidCount ?? 0,
      waivedCount: totals?.waivedCount ?? 0,
      feeTotalCents: totals?.feeTotalCents ?? 0,
      currency,
      updatedAt: new Date(),
    })
    .where(eq(membershipReportGroups.id, reportGroupId));
}

/** The report a payment for `periodLabel` should feed, if one is collecting. */
async function getOpenReport(orgId: string, periodLabel: string) {
  const [report] = await db
    .select({ id: membershipReports.id })
    .from(membershipReports)
    .where(
      and(
        eq(membershipReports.orgId, orgId),
        eq(membershipReports.periodLabel, periodLabel),
        eq(membershipReports.status, "open"),
      ),
    )
    .limit(1);

  return report ?? null;
}

/**
 * Records one member's confirmation against the open report, if there is one.
 *
 * Called from the payment actions rather than a nightly job: the report entry
 * is a consequence of the payment decision and has to be written in step with
 * it. A cron gap would let a group submit between the payment and its report
 * row, leaving the two records disagreeing with no way to tell which is right.
 *
 * A group that has already submitted is frozen. The member is still recorded,
 * but held out of the counts as a pending addition for a group admin to accept.
 */
export async function syncReportMemberForPayment(paymentId: string) {
  const [row] = await db
    .select({
      orgId: memberPayments.orgId,
      memberId: memberPayments.memberId,
      periodLabel: memberPayments.periodLabel,
      status: memberPayments.status,
      cancellationReason: memberPayments.cancellationReason,
      amount: memberPayments.amount,
      currency: memberPayments.currency,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      reportEnabled: organizations.membershipReportEnabled,
    })
    .from(memberPayments)
    .innerJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
    .innerJoin(organizations, eq(memberPayments.orgId, organizations.id))
    .where(eq(memberPayments.id, paymentId))
    .limit(1);

  if (!row || !row.reportEnabled) return;

  const report = await getOpenReport(row.orgId, row.periodLabel);
  if (!report) return;

  const category = await getFeeManagingCategory(row.orgId);
  if (!category) return;

  const groupByMember = await getReportGroupIdByMember(row.orgId, category.id, [
    row.memberId,
  ]);
  const groupId = groupByMember.get(row.memberId);
  if (!groupId) return;

  const [reportGroup] = await db
    .select({ id: membershipReportGroups.id, status: membershipReportGroups.status })
    .from(membershipReportGroups)
    .where(
      and(
        eq(membershipReportGroups.reportId, report.id),
        eq(membershipReportGroups.groupId, groupId),
      ),
    )
    .limit(1);

  if (!reportGroup) return;

  const basis = getConfirmationBasis(row);

  // The payment stopped confirming anything — cancelled as a duplicate, say.
  // Drop the row rather than leaving a member the group never confirmed.
  if (basis === null) {
    await db
      .delete(membershipReportMembers)
      .where(
        and(
          eq(membershipReportMembers.reportGroupId, reportGroup.id),
          eq(membershipReportMembers.memberId, row.memberId),
          eq(membershipReportMembers.paymentId, paymentId),
        ),
      );
    await recalculateReportGroupCounts(reportGroup.id);
    return;
  }

  const isFrozen =
    reportGroup.status === "submitted" || reportGroup.status === "approved";

  await db
    .insert(membershipReportMembers)
    .values({
      orgId: row.orgId,
      reportGroupId: reportGroup.id,
      memberId: row.memberId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      confirmationBasis: basis,
      paymentId,
      feeAmountCents: basis === "paid" ? row.amount : 0,
      currency: row.currency,
      included: true,
      pendingAddition: isFrozen,
    })
    .onConflictDoUpdate({
      target: [
        membershipReportMembers.reportGroupId,
        membershipReportMembers.memberId,
      ],
      set: {
        confirmationBasis: basis,
        paymentId,
        feeAmountCents: basis === "paid" ? row.amount : 0,
        currency: row.currency,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        updatedAt: new Date(),
      },
    });

  await recalculateReportGroupCounts(reportGroup.id);
}

export type OpenReportResult = {
  reportId: string;
  periodLabel: string;
  groupsCreated: number;
  membersBackfilled: number;
};

/**
 * Opens the report for a period: one row per active group in the fee-managing
 * category, backfilled with everyone who has already paid.
 *
 * The period bounds and the group names are copied in, not joined. A report
 * describes a year that has already happened, and must keep saying what it said
 * after someone renames a region or changes the renewal settings.
 */
export async function openMembershipReport(params: {
  orgId: string;
  userId: string;
  /** Overrides the organization's configured deadline for this period only. */
  confirmDueAt?: Date | null;
  today?: Date;
}): Promise<OpenReportResult> {
  const { orgId, userId } = params;
  const today = params.today ?? new Date();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) throw new Error("Organization not found.");
  if (!org.membershipReportEnabled) {
    throw new Error("The yearly member report is not enabled.");
  }

  const category = await getFeeManagingCategory(orgId);
  if (!category) {
    throw new Error(
      "No active group category manages membership fees, so the report has no groups to collect from.",
    );
  }

  const period = resolveMembershipPeriod({
    mode: org.membershipPeriodMode,
    renewalMonth: org.membershipRenewalMonth,
    renewalDay: org.membershipRenewalDay,
    today,
  });

  // Falls back to the organization's configured deadline, anchored to this
  // period's year rather than today's.
  const confirmDueAt =
    params.confirmDueAt !== undefined
      ? params.confirmDueAt
      : resolveConfirmDueDate({
          period,
          month: org.membershipReportConfirmMonth,
          day: org.membershipReportConfirmDay,
        });

  const [existing] = await db
    .select({
      id: membershipReports.id,
      status: membershipReports.status,
    })
    .from(membershipReports)
    .where(
      and(
        eq(membershipReports.orgId, orgId),
        eq(membershipReports.periodLabel, period.label),
      ),
    )
    .limit(1);

  // This function doubles as "Refresh from payments", which used to set the
  // status back to `open` unconditionally — quietly undoing a sign-off. A
  // closed year reopens only through the named action.
  if (existing?.status === "closed") {
    throw new Error(
      `The ${period.label} report is closed. Reopen it before refreshing from payments.`,
    );
  }

  const [report] = await db
    .insert(membershipReports)
    .values({
      orgId,
      periodLabel: period.label,
      periodStart: period.start,
      periodEnd: period.end,
      currency: org.membershipFeeCurrency,
      confirmDueAt,
      status: "open",
      openedAt: today,
      createdByUserId: userId,
    })
    .onConflictDoUpdate({
      target: [membershipReports.orgId, membershipReports.periodLabel],
      set: {
        // `status`, `closedAt` and `currency` are absent on purpose. The first
        // two belong to close/reopen; the third is snapshotted at open time and
        // a refresh must not relabel the totals.
        //
        // The deadline is only written when this call was given one. Re-deriving
        // it from the organization settings on every refresh would silently
        // overwrite a date somebody set for this year on purpose.
        ...(params.confirmDueAt !== undefined ? { confirmDueAt } : {}),
        updatedAt: new Date(),
      },
    })
    .returning({ id: membershipReports.id });

  const activeGroups = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(
      and(
        eq(groups.orgId, orgId),
        eq(groups.categoryId, category.id),
        eq(groups.isActive, true),
      ),
    )
    .orderBy(asc(groups.sortOrder), asc(groups.name));

  // Every group gets a row up front, so the dashboard can say "0 of 12
  // confirmed" from day one instead of inferring absence from missing rows.
  const reportGroups = activeGroups.length
    ? await db
        .insert(membershipReportGroups)
        .values(
          activeGroups.map((group) => ({
            orgId,
            reportId: report.id,
            groupId: group.id,
            groupName: group.name,
          })),
        )
        .onConflictDoUpdate({
          target: [membershipReportGroups.reportId, membershipReportGroups.groupId],
          set: { updatedAt: new Date() },
        })
        .returning({
          id: membershipReportGroups.id,
          groupId: membershipReportGroups.groupId,
          status: membershipReportGroups.status,
        })
    : [];

  const reportGroupIdByGroupId = new Map(
    reportGroups
      .filter((row): row is typeof row & { groupId: string } => row.groupId !== null)
      .map((row) => [row.groupId, row.id]),
  );

  // Reopening an existing report must not push members into a roster a group
  // has already signed off. They land as pending additions, the same way a late
  // payment does.
  const frozenReportGroupIds = new Set(
    reportGroups
      .filter((row) => row.status === "submitted" || row.status === "approved")
      .map((row) => row.id),
  );

  const membersBackfilled = await backfillReportMembers({
    orgId,
    categoryId: category.id,
    periodLabel: period.label,
    reportGroupIdByGroupId,
    frozenReportGroupIds,
  });

  return {
    reportId: report.id,
    periodLabel: period.label,
    groupsCreated: reportGroups.length,
    membersBackfilled,
  };
}

/**
 * Seeds the roster from payments that were already settled before the report
 * opened. Groups still start at `not_started`: the list is a starting point for
 * them to review, not a confirmation nobody made.
 */
async function backfillReportMembers(params: {
  orgId: string;
  categoryId: string;
  periodLabel: string;
  reportGroupIdByGroupId: Map<string, string>;
  /** Groups whose roster is signed off; new members queue instead of counting. */
  frozenReportGroupIds: Set<string>;
}): Promise<number> {
  const {
    orgId,
    categoryId,
    periodLabel,
    reportGroupIdByGroupId,
    frozenReportGroupIds,
  } = params;
  if (reportGroupIdByGroupId.size === 0) return 0;

  const confirmed = await db
    .select({
      memberId: memberPayments.memberId,
      paymentId: memberPayments.id,
      status: memberPayments.status,
      cancellationReason: memberPayments.cancellationReason,
      amount: memberPayments.amount,
      currency: memberPayments.currency,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
    })
    .from(memberPayments)
    .innerJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
    .where(confirmedPaymentsFilter(orgId, periodLabel));

  if (confirmed.length === 0) return 0;

  const groupByMember = await getReportGroupIdByMember(
    orgId,
    categoryId,
    confirmed.map((row) => row.memberId),
  );

  const values = confirmed.flatMap((row) => {
    const groupId = groupByMember.get(row.memberId);
    const reportGroupId = groupId
      ? reportGroupIdByGroupId.get(groupId)
      : undefined;
    if (!reportGroupId) return [];

    const basis = getConfirmationBasis(row);
    if (!basis) return [];

    return [
      {
        orgId,
        reportGroupId,
        memberId: row.memberId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        confirmationBasis: basis,
        paymentId: row.paymentId,
        feeAmountCents: basis === "paid" ? row.amount : 0,
        currency: row.currency,
        pendingAddition: frozenReportGroupIds.has(reportGroupId),
      },
    ];
  });

  if (values.length === 0) return 0;

  await db
    .insert(membershipReportMembers)
    .values(values)
    .onConflictDoNothing({
      target: [
        membershipReportMembers.reportGroupId,
        membershipReportMembers.memberId,
      ],
    });

  await Promise.all(
    [...reportGroupIdByGroupId.values()].map((id) =>
      recalculateReportGroupCounts(id),
    ),
  );

  return values.length;
}
