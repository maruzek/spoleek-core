"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { forbidden } from "next/navigation";

import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import {
  membershipReportGroups,
  membershipReportMembers,
  membershipReports,
} from "@/server/db/schema";
import {
  openMembershipReport,
  recalculateReportGroupCounts,
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

    await db
      .update(membershipReports)
      .set({
        confirmDueAt: parsedInput.confirmDueAt
          ? new Date(`${parsedInput.confirmDueAt}T00:00:00Z`)
          : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(membershipReports.id, parsedInput.reportId),
          eq(membershipReports.orgId, organization.id),
        ),
      );

    revalidatePath("/admin/reports");

    return { success: true };
  });

export const closeMembershipReportAction = orgAdminActionClient
  .metadata({ actionName: "closeMembershipReport" })
  .inputSchema(z.object({ reportId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    await db
      .update(membershipReports)
      .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(membershipReports.id, parsedInput.reportId),
          eq(membershipReports.orgId, organization.id),
        ),
      );

    revalidatePath("/admin/reports");

    return { success: true };
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

  const access = await requireGroupManagementAccess(row.groupId);

  if (access.organization.id !== row.orgId) forbidden();

  return { row, access };
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

    if (row.status === "submitted" || row.status === "approved") {
      await db
        .update(membershipReportGroups)
        .set({
          status: "returned",
          returnedAt: new Date(),
          returnedReason: "A member was confirmed after this report was submitted.",
          approvedAt: null,
          approvedByUserId: null,
          selfApproved: false,
          updatedAt: new Date(),
        })
        .where(eq(membershipReportGroups.id, member.reportGroupId));
    }

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
