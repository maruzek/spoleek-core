import { and, asc, eq } from "drizzle-orm";

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
  groupId: string;
  groupName: string;
  status: MembershipReportGroupStatus;
  memberCount: number;
};

export type GroupReportView = {
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
): Promise<GroupReportView | null> {
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
        eq(membershipReports.status, "open"),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [roster, peers] = await Promise.all([
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
      .innerJoin(groups, eq(membershipReportGroups.groupId, groups.id))
      .where(eq(membershipReportGroups.reportId, row.reportId))
      .orderBy(asc(groups.sortOrder), asc(membershipReportGroups.groupName)),
  ]);

  return {
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
