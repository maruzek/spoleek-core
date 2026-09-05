import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  getFeeManagingCategory,
  listUnassignedConfirmedMembers,
  type UnassignedConfirmedMember,
} from "@/server/lib/membership-report";
import {
  groupMemberships,
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
  /**
   * Members of this group with no row on the roster yet — the candidates for a
   * manual add. Empty once the report is closed, where nothing can be added.
   */
  addableMembers: AddableMemberRow[];
};

export type AddableMemberRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
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

  const rosterMemberIds = roster
    .map((member) => member.memberId)
    .filter((id): id is string => id !== null);

  // Only offered while the report is collecting. A closed year takes no
  // additions of any kind, manual ones included.
  const addableMembers =
    row.reportStatus === "open"
      ? await db
          .select({
            id: tenantMembers.id,
            firstName: tenantMembers.firstName,
            lastName: tenantMembers.lastName,
            email: tenantMembers.email,
          })
          .from(groupMemberships)
          .innerJoin(
            tenantMembers,
            eq(groupMemberships.memberId, tenantMembers.id),
          )
          .where(
            and(
              eq(groupMemberships.orgId, orgId),
              eq(groupMemberships.groupId, groupId),
              eq(tenantMembers.status, "active"),
              rosterMemberIds.length > 0
                ? notInArray(tenantMembers.id, rosterMemberIds)
                : undefined,
            ),
          )
          .orderBy(asc(tenantMembers.lastName), asc(tenantMembers.firstName))
      : [];

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
    addableMembers,
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
  /**
   * Confirmed for this period but in no group that reports, so in no roster
   * either. The board's total is short by exactly these people.
   */
  unassigned: UnassignedConfirmedMember[];
  /**
   * Active groups that have no row in this report — created, activated or
   * recategorized since it opened. Nothing adds them until somebody refreshes
   * from payments, so the board is told rather than left to notice.
   */
  missingGroups: Array<{ id: string; name: string }>;
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

  const [periods, unassigned, category] = await Promise.all([
    listReportPeriods(orgId),
    listUnassignedConfirmedMembers(orgId, report.periodLabel),
    getFeeManagingCategory(orgId),
  ]);

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

  // Not `groups`: that name belongs to the table this function also queries.
  const boardGroups: BoardGroupRow[] = groupRows.map((row) => {
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

  // Drift is only actionable while the report is collecting; a closed year is
  // a record of the groups that existed then, not of the ones that exist now.
  const missingGroups =
    category && report.status === "open"
      ? await db
          .select({ id: groups.id, name: groups.name })
          .from(groups)
          .where(
            and(
              eq(groups.orgId, orgId),
              eq(groups.categoryId, category.id),
              eq(groups.isActive, true),
              groupRows.length > 0
                ? notInArray(
                    groups.id,
                    groupRows
                      .map((row) => row.groupId)
                      .filter((id): id is string => id !== null),
                  )
                : undefined,
            ),
          )
          .orderBy(asc(groups.sortOrder), asc(groups.name))
      : [];

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
    groups: boardGroups,
    unassigned,
    missingGroups,
    totals: {
      groupCount: boardGroups.length,
      submittedCount: boardGroups.filter(
        (group) => group.status === "submitted" || group.status === "approved",
      ).length,
      approvedCount: boardGroups.filter((group) => group.status === "approved").length,
      memberCount: boardGroups.reduce((sum, group) => sum + group.memberCount, 0),
      feeTotalCents: boardGroups.reduce((sum, group) => sum + group.feeTotalCents, 0),
      // Snapshotted on the report; the group rows carry the same value.
      currency: report.currency ?? "CZK",
      pendingAdditions: boardGroups.reduce(
        (sum, group) => sum + group.pendingAdditions,
        0,
      ),
    },
  };
}
