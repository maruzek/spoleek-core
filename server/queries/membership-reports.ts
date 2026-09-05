import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  groups,
  membershipReportGroups,
  membershipReportMembers,
  membershipReports,
  tenantMembers,
  type MembershipReportConfirmationBasis,
  type MembershipReportGroupStatus,
} from "@/server/db/schema";

export type ReportPeriodOption = {
  id: string;
  periodLabel: string;
  status: "draft" | "open" | "closed";
};

/**
 * Every reporting cycle the organization has run, newest first.
 *
 * Feeds the year picker. Past reports stay readable forever — that is the whole
 * point of freezing the roster, and a report nobody can open again is just a
 * more expensive way of deleting it.
 */
export async function listReportPeriods(
  orgId: string,
): Promise<ReportPeriodOption[]> {
  return db
    .select({
      id: membershipReports.id,
      periodLabel: membershipReports.periodLabel,
      status: membershipReports.status,
    })
    .from(membershipReports)
    .where(eq(membershipReports.orgId, orgId))
    .orderBy(desc(membershipReports.periodLabel));
}

/**
 * Resolves which report to show: the one asked for, else the one still
 * collecting, else the most recent. Falling back rather than erroring means a
 * stale link to a deleted report lands on something useful.
 */
async function resolveReportId(
  orgId: string,
  requestedId?: string,
): Promise<string | null> {
  if (requestedId) {
    const [requested] = await db
      .select({ id: membershipReports.id })
      .from(membershipReports)
      .where(
        and(
          eq(membershipReports.id, requestedId),
          eq(membershipReports.orgId, orgId),
        ),
      )
      .limit(1);

    if (requested) return requested.id;
  }

  const [open] = await db
    .select({ id: membershipReports.id })
    .from(membershipReports)
    .where(
      and(eq(membershipReports.orgId, orgId), eq(membershipReports.status, "open")),
    )
    .limit(1);

  if (open) return open.id;

  const [latest] = await db
    .select({ id: membershipReports.id })
    .from(membershipReports)
    .where(eq(membershipReports.orgId, orgId))
    .orderBy(desc(membershipReports.periodLabel))
    .limit(1);

  return latest?.id ?? null;
}

export type ReportRosterRow = {
  id: string;
  memberId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  confirmationBasis: MembershipReportConfirmationBasis;
  feeAmountCents: number | null;
  currency: string | null;
  included: boolean;
  pendingAddition: boolean;
  note: string | null;
};

/**
 * How another group is doing, with no personal data in it.
 *
 * Progress is not personal data — "Brno: submitted, 34 members" says nothing
 * about any individual — so every group admin may see it, and the peer pressure
 * is the point. Rosters are personal data and stay behind the group's own
 * route, which is why this type has no names in it.
 */
export type PeerProgressRow = {
  /** Null once the group is deleted; the row stays as history. */
  groupId: string | null;
  groupName: string;
  status: MembershipReportGroupStatus;
  memberCount: number;
};

export type GroupReportView = {
  /** Every cycle this organization has run, for the year picker. */
  periods: ReportPeriodOption[];
  /** False for a closed report or a past year — the card renders read-only. */
  isEditable: boolean;
  report: {
    id: string;
    periodLabel: string;
    periodStart: Date;
    periodEnd: Date;
    confirmDueAt: Date | null;
    status: "draft" | "open" | "closed";
  };
  reportGroup: {
    id: string;
    status: MembershipReportGroupStatus;
    submittedAt: Date | null;
    submittedByName: string | null;
    submissionNote: string | null;
    approvedAt: Date | null;
    selfApproved: boolean;
    returnedAt: Date | null;
    returnedReason: string | null;
    memberCount: number;
    paidCount: number;
    waivedCount: number;
    feeTotalCents: number;
    currency: string | null;
  };
  roster: ReportRosterRow[];
  peers: PeerProgressRow[];
};

/**
 * Everything one group needs to work its slice of the current report.
 *
 * Returns null when the module is off, no report is collecting, or this group
 * is not in the fee-managing category — the caller renders nothing rather than
 * an empty shell, because a group that does not report should not be told it
 * has a report to file.
 */
export async function getGroupReportView(
  orgId: string,
  groupId: string,
  requestedReportId?: string,
): Promise<GroupReportView | null> {
  const reportId = await resolveReportId(orgId, requestedReportId);
  if (!reportId) return null;

  const [row] = await db
    .select({
      reportId: membershipReports.id,
      periodLabel: membershipReports.periodLabel,
      periodStart: membershipReports.periodStart,
      periodEnd: membershipReports.periodEnd,
      confirmDueAt: membershipReports.confirmDueAt,
      reportStatus: membershipReports.status,
      reportGroupId: membershipReportGroups.id,
      status: membershipReportGroups.status,
      submittedAt: membershipReportGroups.submittedAt,
      submittedByFirstName: tenantMembers.firstName,
      submittedByLastName: tenantMembers.lastName,
      submissionNote: membershipReportGroups.submissionNote,
      approvedAt: membershipReportGroups.approvedAt,
      selfApproved: membershipReportGroups.selfApproved,
      returnedAt: membershipReportGroups.returnedAt,
      returnedReason: membershipReportGroups.returnedReason,
      memberCount: membershipReportGroups.memberCount,
      paidCount: membershipReportGroups.paidCount,
      waivedCount: membershipReportGroups.waivedCount,
      feeTotalCents: membershipReportGroups.feeTotalCents,
      currency: membershipReportGroups.currency,
    })
    .from(membershipReportGroups)
    .innerJoin(
      membershipReports,
      eq(membershipReportGroups.reportId, membershipReports.id),
    )
    .leftJoin(
      tenantMembers,
      eq(membershipReportGroups.submittedByMemberId, tenantMembers.id),
    )
    .where(
      and(
        eq(membershipReportGroups.orgId, orgId),
        eq(membershipReportGroups.groupId, groupId),
        eq(membershipReports.id, reportId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [periods, roster, peers] = await Promise.all([
    listReportPeriods(orgId),
    db
      .select({
        id: membershipReportMembers.id,
        memberId: membershipReportMembers.memberId,
        firstName: membershipReportMembers.firstName,
        lastName: membershipReportMembers.lastName,
        email: membershipReportMembers.email,
        confirmationBasis: membershipReportMembers.confirmationBasis,
        feeAmountCents: membershipReportMembers.feeAmountCents,
        currency: membershipReportMembers.currency,
        included: membershipReportMembers.included,
        pendingAddition: membershipReportMembers.pendingAddition,
        note: membershipReportMembers.note,
      })
      .from(membershipReportMembers)
      .where(eq(membershipReportMembers.reportGroupId, row.reportGroupId))
      .orderBy(
        asc(membershipReportMembers.lastName),
        asc(membershipReportMembers.firstName),
      ),
    db
      .select({
        groupId: membershipReportGroups.groupId,
        groupName: membershipReportGroups.groupName,
        status: membershipReportGroups.status,
        memberCount: membershipReportGroups.memberCount,
      })
      .from(membershipReportGroups)
      // Left, not inner: a group deleted since the report opened still has a
      // row here, and dropping it would make the peer list disagree with the
      // board's. It sorts last, having no sort order of its own.
      .leftJoin(groups, eq(membershipReportGroups.groupId, groups.id))
      .where(eq(membershipReportGroups.reportId, row.reportId))
      .orderBy(
        sql`${groups.sortOrder} nulls last`,
        asc(membershipReportGroups.groupName),
      ),
  ]);

  return {
    periods,
    isEditable: row.reportStatus === "open",
    report: {
      id: row.reportId,
      periodLabel: row.periodLabel,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      confirmDueAt: row.confirmDueAt,
      status: row.reportStatus,
    },
    reportGroup: {
      id: row.reportGroupId,
      status: row.status,
      submittedAt: row.submittedAt,
      submittedByName:
        [row.submittedByFirstName, row.submittedByLastName]
          .filter(Boolean)
          .join(" ") || null,
      submissionNote: row.submissionNote,
      approvedAt: row.approvedAt,
      selfApproved: row.selfApproved,
      returnedAt: row.returnedAt,
      returnedReason: row.returnedReason,
      memberCount: row.memberCount,
      paidCount: row.paidCount,
      waivedCount: row.waivedCount,
      feeTotalCents: row.feeTotalCents,
      currency: row.currency,
    },
    roster,
    peers,
  };
}


export type BoardGroupRow = {
  reportGroupId: string;
  /** Null once the group is deleted; the row stays as history. */
  groupId: string | null;
  groupName: string;
  status: MembershipReportGroupStatus;
  submittedAt: Date | null;
  submittedByName: string | null;
  /** The user behind the submitting member, for the self-approval guard. */
  submittedByUserId: string | null;
  submissionNote: string | null;
  approvedAt: Date | null;
  selfApproved: boolean;
  returnedReason: string | null;
  memberCount: number;
  paidCount: number;
  waivedCount: number;
  feeTotalCents: number;
  currency: string | null;
  pendingAdditions: number;
  roster: ReportRosterRow[];
};

export type BoardReportView = {
  periods: ReportPeriodOption[];
  /** False for a closed report — approve and send back are withdrawn. */
  isEditable: boolean;
  report: {
    id: string;
    periodLabel: string;
    periodStart: Date;
    periodEnd: Date;
    confirmDueAt: Date | null;
    status: "draft" | "open" | "closed";
  };
  groups: BoardGroupRow[];
  totals: {
    groupCount: number;
    submittedCount: number;
    approvedCount: number;
    memberCount: number;
    feeTotalCents: number;
    currency: string;
    pendingAdditions: number;
  };
};

/**
 * The board's view of the whole reporting cycle.
 *
 * Rosters are included because `canManageOrganization` is the one role entitled
 * to see names across every group — the route enforces that, and nothing below
 * it needs to filter again. Group admins never reach this query; they get
 * `PeerProgressRow`, which has no name in it.
 */
export async function getBoardReportView(
  orgId: string,
  requestedReportId?: string,
): Promise<BoardReportView | null> {
  const reportId = await resolveReportId(orgId, requestedReportId);
  if (!reportId) return null;

  const [report] = await db
    .select()
    .from(membershipReports)
    .where(eq(membershipReports.id, reportId))
    .limit(1);

  if (!report) return null;

  const periods = await listReportPeriods(orgId);

  const groupRows = await db
    .select({
      reportGroupId: membershipReportGroups.id,
      groupId: membershipReportGroups.groupId,
      groupName: membershipReportGroups.groupName,
      status: membershipReportGroups.status,
      submittedAt: membershipReportGroups.submittedAt,
      submittedByFirstName: tenantMembers.firstName,
      submittedByLastName: tenantMembers.lastName,
      submittedByUserId: tenantMembers.userId,
      submissionNote: membershipReportGroups.submissionNote,
      approvedAt: membershipReportGroups.approvedAt,
      selfApproved: membershipReportGroups.selfApproved,
      returnedReason: membershipReportGroups.returnedReason,
      memberCount: membershipReportGroups.memberCount,
      paidCount: membershipReportGroups.paidCount,
      waivedCount: membershipReportGroups.waivedCount,
      feeTotalCents: membershipReportGroups.feeTotalCents,
      currency: membershipReportGroups.currency,
    })
    .from(membershipReportGroups)
    .leftJoin(
      tenantMembers,
      eq(membershipReportGroups.submittedByMemberId, tenantMembers.id),
    )
    .where(eq(membershipReportGroups.reportId, report.id))
    .orderBy(asc(membershipReportGroups.groupName));

  // One query for every roster rather than one per group: the board table shows
  // a dozen regions and a fan-out would be a dozen round trips.
  const rosterRows = groupRows.length
    ? await db
        .select({
          id: membershipReportMembers.id,
          reportGroupId: membershipReportMembers.reportGroupId,
          memberId: membershipReportMembers.memberId,
          firstName: membershipReportMembers.firstName,
          lastName: membershipReportMembers.lastName,
          email: membershipReportMembers.email,
          confirmationBasis: membershipReportMembers.confirmationBasis,
          feeAmountCents: membershipReportMembers.feeAmountCents,
          currency: membershipReportMembers.currency,
          included: membershipReportMembers.included,
          pendingAddition: membershipReportMembers.pendingAddition,
          note: membershipReportMembers.note,
        })
        .from(membershipReportMembers)
        .where(
          inArray(
            membershipReportMembers.reportGroupId,
            groupRows.map((row) => row.reportGroupId),
          ),
        )
        .orderBy(
          asc(membershipReportMembers.lastName),
          asc(membershipReportMembers.firstName),
        )
    : [];

  const rosterByGroup = new Map<string, ReportRosterRow[]>();
  for (const row of rosterRows) {
    const { reportGroupId, ...member } = row;
    const list = rosterByGroup.get(reportGroupId);
    if (list) list.push(member);
    else rosterByGroup.set(reportGroupId, [member]);
  }

  const groups: BoardGroupRow[] = groupRows.map((row) => {
    const roster = rosterByGroup.get(row.reportGroupId) ?? [];
    return {
      reportGroupId: row.reportGroupId,
      groupId: row.groupId,
      groupName: row.groupName,
      status: row.status,
      submittedAt: row.submittedAt,
      submittedByName:
        [row.submittedByFirstName, row.submittedByLastName]
          .filter(Boolean)
          .join(" ") || null,
      submittedByUserId: row.submittedByUserId,
      submissionNote: row.submissionNote,
      approvedAt: row.approvedAt,
      selfApproved: row.selfApproved,
      returnedReason: row.returnedReason,
      memberCount: row.memberCount,
      paidCount: row.paidCount,
      waivedCount: row.waivedCount,
      feeTotalCents: row.feeTotalCents,
      currency: row.currency,
      pendingAdditions: roster.filter((member) => member.pendingAddition).length,
      roster,
    };
  });

  return {
    periods,
    isEditable: report.status === "open",
    report: {
      id: report.id,
      periodLabel: report.periodLabel,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      confirmDueAt: report.confirmDueAt,
      status: report.status,
    },
    groups,
    totals: {
      groupCount: groups.length,
      submittedCount: groups.filter(
        (group) => group.status === "submitted" || group.status === "approved",
      ).length,
      approvedCount: groups.filter((group) => group.status === "approved").length,
      memberCount: groups.reduce((sum, group) => sum + group.memberCount, 0),
      feeTotalCents: groups.reduce((sum, group) => sum + group.feeTotalCents, 0),
      currency: groups.find((group) => group.currency)?.currency ?? "CZK",
      pendingAdditions: groups.reduce(
        (sum, group) => sum + group.pendingAdditions,
        0,
      ),
    },
  };
}
