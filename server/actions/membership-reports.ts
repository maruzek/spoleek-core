"use server";

import { and, count, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { forbidden } from "next/navigation";

import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import {
  groupMemberships,
  membershipReportGroups,
  membershipReportMembers,
  membershipReports,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import {
  getApprovalDecision,
  isReportGroupFrozen,
  listUnassignedConfirmedMembers,
  openMembershipReport,
  recalculateReportGroupCounts,
  type ApprovalRefusal,
} from "@/server/lib/membership-report";
import {
  requireGroupManagementAccess,
  requireOrgAdminAccess,
} from "@/server/queries/access";

/**
 * A calendar date with no time component.
 *
 * The confirmation deadline is a day the whole organization shares, not an
 * instant — storing it as a timestamp would make it land on a different date
 * for an admin in another timezone.
 */
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.");

/** The single approve's own wording for each refusal the shared rules return. */
const APPROVAL_REFUSAL_MESSAGE: Record<ApprovalRefusal, string> = {
  report_closed: "This report is closed. Reopen it before changing anything.",
  not_submitted: "Only a submitted report can be approved.",
  self_approval:
    "You submitted this report, so somebody else has to approve it. An org admin can allow self-approval in Settings → Membership.",
};

export const openMembershipReportAction = orgAdminActionClient
  .metadata({ actionName: "openMembershipReport" })
  .inputSchema(
    // Omitted entirely means "use the organization's configured deadline".
    z.object({
      confirmDueAt: dateOnlySchema.nullable().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { organization } = await requireOrgAdminAccess();

    const result = await openMembershipReport({
      orgId: organization.id,
      userId: ctx.auth.user.id,
      confirmDueAt:
        parsedInput.confirmDueAt === undefined
          ? undefined
          : parsedInput.confirmDueAt
            ? new Date(`${parsedInput.confirmDueAt}T00:00:00Z`)
            : null,
    });

    revalidatePath("/admin/reports");

    return result;
  });

export const setReportDeadlineAction = orgAdminActionClient
  .metadata({ actionName: "setReportDeadline" })
  .inputSchema(
    z.object({
      reportId: z.string().uuid(),
      confirmDueAt: dateOnlySchema.nullable().default(null),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();
    const report = await loadReportForBoard(organization.id, parsedInput.reportId);

    if (report.status === "closed") {
      throw new Error("This report is closed. Reopen it before changing anything.");
    }

    await db
      .update(membershipReports)
      .set({
        confirmDueAt: parsedInput.confirmDueAt
          ? new Date(`${parsedInput.confirmDueAt}T00:00:00Z`)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(membershipReports.id, report.id));

    revalidatePath("/admin/reports");
    // The group card shows the same deadline and the reminder copy quotes it.
    revalidatePath("/admin/groups", "layout");

    return { success: true };
  });

/** The report row, scoped to the caller's organization. */
async function loadReportForBoard(orgId: string, reportId: string) {
  const [report] = await db
    .select({
      id: membershipReports.id,
      periodLabel: membershipReports.periodLabel,
      status: membershipReports.status,
    })
    .from(membershipReports)
    .where(
      and(eq(membershipReports.id, reportId), eq(membershipReports.orgId, orgId)),
    )
    .limit(1);

  if (!report) forbidden();

  return report;
}

/**
 * What is still unfinished about a report, for the close confirmation.
 *
 * Recomputed server-side rather than trusted from the client: the dialog names
 * these numbers, and closing is permanent.
 */
async function getReportClosePreconditions(
  orgId: string,
  reportId: string,
  periodLabel: string,
) {
  const [[unapproved], unassigned] = await Promise.all([
    db
      .select({ value: count() })
      .from(membershipReportGroups)
      .where(
        and(
          eq(membershipReportGroups.reportId, reportId),
          ne(membershipReportGroups.status, "approved"),
        ),
      ),
    listUnassignedConfirmedMembers(orgId, periodLabel),
  ]);

  return {
    unapprovedGroups: unapproved?.value ?? 0,
    unassignedMembers: unassigned.length,
  };
}

/**
 * Makes a report permanent.
 *
 * Closing is not refused when groups are unapproved or members sit outside
 * every group — an organization may have a good reason, and a rule it cannot
 * get past would just be worked around in SQL. It does demand that the caller
 * say so: the counts are recomputed here, and an acknowledgement is required
 * when either is non-zero, so nobody closes a short year by accident.
 */
export const closeMembershipReportAction = orgAdminActionClient
  .metadata({ actionName: "closeMembershipReport" })
  .inputSchema(
    z.object({
      reportId: z.string().uuid(),
      acknowledgeIncomplete: z.boolean().default(false),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();
    const report = await loadReportForBoard(organization.id, parsedInput.reportId);

    if (report.status === "closed") {
      throw new Error("This report is already closed.");
    }

    const { unapprovedGroups, unassignedMembers } =
      await getReportClosePreconditions(
        organization.id,
        report.id,
        report.periodLabel,
      );

    if (
      (unapprovedGroups > 0 || unassignedMembers > 0) &&
      !parsedInput.acknowledgeIncomplete
    ) {
      const parts = [
        unapprovedGroups > 0
          ? `${unapprovedGroups} group${unapprovedGroups === 1 ? " is" : "s are"} not approved`
          : null,
        unassignedMembers > 0
          ? `${unassignedMembers} confirmed member${unassignedMembers === 1 ? " is" : "s are"} in no group`
          : null,
      ].filter(Boolean);

      throw new Error(
        `${parts.join(" and ")}. Confirm you want to close ${report.periodLabel} anyway.`,
      );
    }

    await db
      .update(membershipReports)
      .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(membershipReports.id, report.id));

    revalidatePath("/admin/reports");
    revalidatePath("/admin/groups", "layout");

    return { success: true, periodLabel: report.periodLabel };
  });

/**
 * Reopens a closed report.
 *
 * Deliberately its own action rather than a side effect of refreshing from
 * payments: a closed year is a record the board signed off, and undoing that
 * has to be something somebody chose to do.
 */
export const reopenMembershipReportAction = orgAdminActionClient
  .metadata({ actionName: "reopenMembershipReport" })
  .inputSchema(z.object({ reportId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();
    const report = await loadReportForBoard(organization.id, parsedInput.reportId);

    if (report.status !== "closed") {
      throw new Error("This report is not closed.");
    }

    await db
      .update(membershipReports)
      .set({ status: "open", closedAt: null, updatedAt: new Date() })
      .where(eq(membershipReports.id, report.id));

    revalidatePath("/admin/reports");
    revalidatePath("/admin/groups", "layout");

    return { success: true, periodLabel: report.periodLabel };
  });


/**
 * Resolves the caller's access to one group's report row.
 *
 * Authorization goes through the group, not the report: a group admin reaches
 * their own report because they administer that group, which is the same guard
 * the rest of the group page uses. A report row is never addressable on its own.
 */
async function requireReportGroupAccess(reportGroupId: string) {
  const [row] = await db
    .select({
      id: membershipReportGroups.id,
      orgId: membershipReportGroups.orgId,
      groupId: membershipReportGroups.groupId,
      status: membershipReportGroups.status,
      reportStatus: membershipReports.status,
    })
    .from(membershipReportGroups)
    .innerJoin(
      membershipReports,
      eq(membershipReportGroups.reportId, membershipReports.id),
    )
    .where(eq(membershipReportGroups.id, reportGroupId))
    .limit(1);

  if (!row) forbidden();

  // The group has been deleted. The row stays readable as history, but there
  // is no longer anything to check access against, so it cannot be acted on.
  const groupId = row.groupId;
  if (!groupId) forbidden();

  const access = await requireGroupManagementAccess(groupId);

  if (access.organization.id !== row.orgId) forbidden();

  return { row: { ...row, groupId }, access };
}

/** A group may still edit its roster until it submits. */
function assertEditable(status: string, reportStatus: string) {
  if (reportStatus !== "open") {
    throw new Error("This report is no longer collecting.");
  }
  if (status === "submitted" || status === "approved") {
    throw new Error(
      "This report has been submitted and is locked. Ask the board to return it if it needs changing.",
    );
  }
}

export const setReportMemberInclusionAction = authActionClient
  .metadata({ actionName: "setReportMemberInclusion" })
  .inputSchema(
    z.object({
      reportMemberId: z.string().uuid(),
      included: z.boolean(),
      note: z.string().trim().max(500).optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const [member] = await db
      .select({ reportGroupId: membershipReportMembers.reportGroupId })
      .from(membershipReportMembers)
      .where(eq(membershipReportMembers.id, parsedInput.reportMemberId))
      .limit(1);

    if (!member) forbidden();

    const { row } = await requireReportGroupAccess(member.reportGroupId);
    assertEditable(row.status, row.reportStatus);

    // Excluding someone the payments say is confirmed overrides the record, so
    // the reason is mandatory — the board has to be able to read why.
    if (!parsedInput.included && !parsedInput.note) {
      throw new Error("Give a reason when leaving a member out of the report.");
    }

    await db
      .update(membershipReportMembers)
      .set({
        included: parsedInput.included,
        note: parsedInput.note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(membershipReportMembers.id, parsedInput.reportMemberId));

    await recalculateReportGroupCounts(member.reportGroupId);
    revalidatePath("/admin/groups", "layout");

    return { success: true };
  });

/**
 * Adds a member the system has no payment for.
 *
 * Someone who paid cash at a meeting is a real member of the organization, and
 * without this the region has one way to report them: mark a payment paid that
 * never went through the account. That corrupts the payment record to fix the
 * report, which is exactly what this module exists to prevent — so the escape
 * hatch is explicit, carries a mandatory reason, and is labelled `manual` on
 * the roster for the board to see.
 *
 * No money is recorded. The member counts, the fee total does not move, because
 * the organization's accounts never saw it.
 *
 * The freeze applies as it does to a late payment: added to a roster that is
 * already signed off, they queue as a pending addition rather than changing an
 * approved number behind the board's back.
 */
export const addReportMemberManuallyAction = authActionClient
  .metadata({ actionName: "addReportMemberManually" })
  .inputSchema(
    z.object({
      reportGroupId: z.string().uuid(),
      memberId: z.string().uuid(),
      note: z.string().trim().min(1).max(500),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { row } = await requireReportGroupAccess(parsedInput.reportGroupId);

    if (row.reportStatus !== "open") {
      throw new Error("This report is no longer collecting.");
    }

    // Membership of this group is the whole of the authorization: the caller
    // administers the group, so they may only add people who are in it.
    const [membership] = await db
      .select({
        memberId: tenantMembers.id,
        firstName: tenantMembers.firstName,
        lastName: tenantMembers.lastName,
        email: tenantMembers.email,
        status: tenantMembers.status,
      })
      .from(groupMemberships)
      .innerJoin(tenantMembers, eq(groupMemberships.memberId, tenantMembers.id))
      .where(
        and(
          eq(groupMemberships.orgId, row.orgId),
          eq(groupMemberships.groupId, row.groupId),
          eq(groupMemberships.memberId, parsedInput.memberId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new Error("That member is not in this group.");
    }

    if (membership.status !== "active") {
      throw new Error("Only an active member can be added to the report.");
    }

    const [existing] = await db
      .select({ id: membershipReportMembers.id })
      .from(membershipReportMembers)
      .where(
        and(
          eq(membershipReportMembers.reportGroupId, parsedInput.reportGroupId),
          eq(membershipReportMembers.memberId, parsedInput.memberId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new Error("That member is already on this report.");
    }

    const pendingAddition = isReportGroupFrozen(row.status);

    await db.insert(membershipReportMembers).values({
      orgId: row.orgId,
      reportGroupId: parsedInput.reportGroupId,
      memberId: membership.memberId,
      firstName: membership.firstName,
      lastName: membership.lastName,
      email: membership.email,
      confirmationBasis: "manual",
      // No payment, so no money and no currency. Leaving these null keeps the
      // member out of the fee total rather than inventing a zero payment.
      paymentId: null,
      feeAmountCents: null,
      currency: null,
      included: true,
      pendingAddition,
      note: parsedInput.note,
    });

    await recalculateReportGroupCounts(parsedInput.reportGroupId);
    revalidatePath("/admin/groups", "layout");
    revalidatePath("/admin/reports");

    return { success: true, pendingAddition };
  });

/**
 * Accepts a member who paid after the group had already submitted.
 *
 * This deliberately sends the group back to `returned`: the board approved a
 * set of numbers, and those numbers are about to change. Letting the addition
 * slip into an approved report would make the approval mean nothing.
 */
export const acceptPendingAdditionAction = authActionClient
  .metadata({ actionName: "acceptPendingAddition" })
  .inputSchema(z.object({ reportMemberId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const [member] = await db
      .select({
        reportGroupId: membershipReportMembers.reportGroupId,
        pendingAddition: membershipReportMembers.pendingAddition,
      })
      .from(membershipReportMembers)
      .where(eq(membershipReportMembers.id, parsedInput.reportMemberId))
      .limit(1);

    if (!member) forbidden();
    if (!member.pendingAddition) {
      throw new Error("That member is already part of the report.");
    }

    const { row } = await requireReportGroupAccess(member.reportGroupId);

    if (row.reportStatus !== "open") {
      throw new Error("This report is no longer collecting.");
    }

    await db
      .update(membershipReportMembers)
      .set({ pendingAddition: false, updatedAt: new Date() })
      .where(eq(membershipReportMembers.id, parsedInput.reportMemberId));

    await recalculateReportGroupCounts(member.reportGroupId);

    await db
      .update(membershipReportGroups)
      .set({
        // The queue this group was being chased about has been dealt with. A
        // later addition starts its own cadence rather than inheriting the
        // last one's timestamp and waiting a week to be mentioned.
        pendingAdditionRemindedAt: null,
        ...(isReportGroupFrozen(row.status)
          ? {
              status: "returned" as const,
              returnedAt: new Date(),
              returnedReason:
                "A member was confirmed after this report was submitted.",
              approvedAt: null,
              approvedByUserId: null,
              selfApproved: false,
              reminderStageSent: null,
              reminderSentAt: null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(membershipReportGroups.id, member.reportGroupId));

    revalidatePath("/admin/groups", "layout");

    return { success: true };
  });

export const submitGroupReportAction = authActionClient
  .metadata({ actionName: "submitGroupReport" })
  .inputSchema(
    z.object({
      reportGroupId: z.string().uuid(),
      submissionNote: z.string().trim().max(1000).optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { row, access } = await requireReportGroupAccess(
      parsedInput.reportGroupId,
    );
    assertEditable(row.status, row.reportStatus);

    await db
      .update(membershipReportGroups)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        submittedByMemberId: access.member?.id ?? null,
        submissionNote: parsedInput.submissionNote ?? null,
        returnedAt: null,
        returnedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(membershipReportGroups.id, parsedInput.reportGroupId));

    revalidatePath("/admin/groups", "layout");

    return { success: true };
  });


/**
 * Loads a group row for a board decision, together with who submitted it.
 *
 * The submitter is resolved all the way to a user id because the self-approval
 * guard compares people, not members — the same person can hold more than one
 * member record over time, but the account approving is the account that
 * submitted.
 */
async function loadReportGroupForBoard(orgId: string, reportGroupId: string) {
  const [row] = await db
    .select({
      id: membershipReportGroups.id,
      status: membershipReportGroups.status,
      submittedByUserId: tenantMembers.userId,
      reportStatus: membershipReports.status,
      allowSelfApproval: organizations.membershipReportAllowSelfApproval,
    })
    .from(membershipReportGroups)
    .innerJoin(
      membershipReports,
      eq(membershipReportGroups.reportId, membershipReports.id),
    )
    .innerJoin(
      organizations,
      eq(membershipReportGroups.orgId, organizations.id),
    )
    .leftJoin(
      tenantMembers,
      eq(membershipReportGroups.submittedByMemberId, tenantMembers.id),
    )
    .where(
      and(
        eq(membershipReportGroups.id, reportGroupId),
        eq(membershipReportGroups.orgId, orgId),
      ),
    )
    .limit(1);

  if (!row) forbidden();

  return row;
}

export const approveGroupReportAction = orgAdminActionClient
  .metadata({ actionName: "approveGroupReport" })
  .inputSchema(z.object({ reportGroupId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const { organization } = await requireOrgAdminAccess();
    const row = await loadReportGroupForBoard(
      organization.id,
      parsedInput.reportGroupId,
    );

    const decision = getApprovalDecision({
      reportStatus: row.reportStatus,
      groupStatus: row.status,
      submittedByUserId: row.submittedByUserId,
      approverUserId: ctx.auth.user.id,
      allowSelfApproval: row.allowSelfApproval,
    });

    if (!decision.approve) {
      throw new Error(APPROVAL_REFUSAL_MESSAGE[decision.code]);
    }

    const isSelfApproval = decision.selfApproved;

    await db
      .update(membershipReportGroups)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedByUserId: ctx.auth.user.id,
        selfApproved: isSelfApproval,
        returnedAt: null,
        returnedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(membershipReportGroups.id, parsedInput.reportGroupId));

    revalidatePath("/admin/reports");
    revalidatePath("/admin/groups", "layout");

    return { success: true, selfApproved: isSelfApproval };
  });

/**
 * Approves several groups at once.
 *
 * Twelve regions is twelve clicks and twelve page refreshes, and the board does
 * this once a year against rows it has already read. The guards are the single
 * approve's guards, applied per row rather than to the batch: a row that cannot
 * be approved is named back to the caller instead of being silently dropped,
 * because a bulk action that quietly skips the caller's own submission teaches
 * them that the number they clicked is not the number they got.
 */
export const bulkApproveGroupReportsAction = orgAdminActionClient
  .metadata({ actionName: "bulkApproveGroupReports" })
  .inputSchema(
    z.object({
      reportGroupIds: z.array(z.string().uuid()).min(1).max(200),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { organization } = await requireOrgAdminAccess();

    const rows = await db
      .select({
        id: membershipReportGroups.id,
        groupName: membershipReportGroups.groupName,
        status: membershipReportGroups.status,
        submittedByUserId: tenantMembers.userId,
        reportStatus: membershipReports.status,
        allowSelfApproval: organizations.membershipReportAllowSelfApproval,
      })
      .from(membershipReportGroups)
      .innerJoin(
        membershipReports,
        eq(membershipReportGroups.reportId, membershipReports.id),
      )
      .innerJoin(
        organizations,
        eq(membershipReportGroups.orgId, organizations.id),
      )
      .leftJoin(
        tenantMembers,
        eq(membershipReportGroups.submittedByMemberId, tenantMembers.id),
      )
      .where(
        and(
          inArray(membershipReportGroups.id, parsedInput.reportGroupIds),
          eq(membershipReportGroups.orgId, organization.id),
        ),
      );

    // An id that resolved to nothing belongs to another organization or does
    // not exist. Refuse the whole batch rather than approving the rest and
    // reporting a count the caller has to reconcile.
    if (rows.length !== parsedInput.reportGroupIds.length) forbidden();

    const approved: string[] = [];
    const skipped: Array<{ groupName: string; reason: string }> = [];
    const now = new Date();

    for (const row of rows) {
      const decision = getApprovalDecision({
        reportStatus: row.reportStatus,
        groupStatus: row.status,
        submittedByUserId: row.submittedByUserId,
        approverUserId: ctx.auth.user.id,
        allowSelfApproval: row.allowSelfApproval,
      });

      if (!decision.approve) {
        skipped.push({ groupName: row.groupName, reason: decision.reason });
        continue;
      }

      const isSelfApproval = decision.selfApproved;

      await db
        .update(membershipReportGroups)
        .set({
          status: "approved",
          approvedAt: now,
          approvedByUserId: ctx.auth.user.id,
          selfApproved: isSelfApproval,
          returnedAt: null,
          returnedReason: null,
          updatedAt: now,
        })
        .where(eq(membershipReportGroups.id, row.id));

      approved.push(row.groupName);
    }

    revalidatePath("/admin/reports");
    revalidatePath("/admin/groups", "layout");

    return { approved, skipped };
  });

export const returnGroupReportAction = orgAdminActionClient
  .metadata({ actionName: "returnGroupReport" })
  .inputSchema(
    z.object({
      reportGroupId: z.string().uuid(),
      reason: z.string().trim().min(1).max(1000),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();
    const row = await loadReportGroupForBoard(
      organization.id,
      parsedInput.reportGroupId,
    );

    if (row.reportStatus !== "open") {
      throw new Error("This report is closed. Reopen it before changing anything.");
    }

    if (row.status !== "submitted" && row.status !== "approved") {
      throw new Error("Only a submitted or approved report can be sent back.");
    }

    await db
      .update(membershipReportGroups)
      .set({
        status: "returned",
        returnedAt: new Date(),
        returnedReason: parsedInput.reason,
        approvedAt: null,
        approvedByUserId: null,
        selfApproved: false,
        // The group is owed the reminder ladder again — it was silenced by a
        // submission that no longer stands.
        reminderStageSent: null,
        reminderSentAt: null,
        updatedAt: new Date(),
      })
      .where(eq(membershipReportGroups.id, parsedInput.reportGroupId));

    revalidatePath("/admin/reports");
    revalidatePath("/admin/groups", "layout");

    return { success: true };
  });
