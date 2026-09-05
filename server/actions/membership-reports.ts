"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { membershipReports } from "@/server/db/schema";
import { openMembershipReport } from "@/server/lib/membership-report";
import { requireOrgAdminAccess } from "@/server/queries/access";

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
    z.object({
      confirmDueAt: dateOnlySchema.nullable().default(null),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { organization } = await requireOrgAdminAccess();

    const result = await openMembershipReport({
      orgId: organization.id,
      userId: ctx.auth.user.id,
      confirmDueAt: parsedInput.confirmDueAt
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
