import { and, eq, inArray } from "drizzle-orm";

import { getServerEnv } from "@/lib/env";
import { RegistrationSubmittedEmail } from "@/emails/registration-submitted-email";
import { db } from "@/server/db";
import { groupCategories, groups, organizations, tenantMembers } from "@/server/db/schema";
import { resolveRegistrationRecipients } from "@/server/notifications/recipients";
import { sendNotificationEmails } from "@/server/notifications/send";

/**
 * Tells the responsible admins that someone applied to join.
 *
 * Call it from `after()` once the application has been committed — it resolves
 * its own data and swallows its own failures, so a mail problem can never turn
 * a successful registration into an error for the applicant.
 */
export async function notifyRegistrationSubmitted(params: {
  orgId: string;
  memberId: string;
  groupIds: string[];
}) {
  try {
    const recipients = await resolveRegistrationRecipients({
      orgId: params.orgId,
      groupIds: params.groupIds,
    });

    if (recipients.length === 0) {
      return;
    }

    const [organization] = await db
      .select({ name: organizations.name, locale: organizations.locale })
      .from(organizations)
      .where(eq(organizations.id, params.orgId))
      .limit(1);

    const [member] = await db
      .select({
        firstName: tenantMembers.firstName,
        lastName: tenantMembers.lastName,
        email: tenantMembers.email,
        createdAt: tenantMembers.createdAt,
      })
      .from(tenantMembers)
      .where(
        and(eq(tenantMembers.orgId, params.orgId), eq(tenantMembers.id, params.memberId)),
      )
      .limit(1);

    if (!organization || !member) {
      return;
    }

    const selectedGroups =
      params.groupIds.length > 0
        ? await db
            .select({
              groupName: groups.name,
              categoryName: groupCategories.name,
              categorySortOrder: groupCategories.sortOrder,
            })
            .from(groups)
            .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
            .where(
              and(eq(groups.orgId, params.orgId), inArray(groups.id, params.groupIds)),
            )
        : [];

    // Grouped by category so the email reads the way the join form did, rather
    // than as a flat list of group names with no context.
    const byCategory = new Map<string, string[]>();

    for (const row of [...selectedGroups].sort(
      (a, b) => a.categorySortOrder - b.categorySortOrder,
    )) {
      byCategory.set(row.categoryName, [
        ...(byCategory.get(row.categoryName) ?? []),
        row.groupName,
      ]);
    }

    const applicantName =
      `${member.firstName} ${member.lastName}`.trim() || (member.email ?? "New applicant");
    const subject = `New membership application — ${applicantName}`;

    await sendNotificationEmails({
      orgId: params.orgId,
      kind: "registration_submitted",
      memberId: params.memberId,
      recipients,
      subject,
      metadata: { groupIds: params.groupIds },
      react: RegistrationSubmittedEmail({
        organizationName: organization.name,
        applicantName,
        applicantEmail: member.email ?? "",
        submittedAt: new Intl.DateTimeFormat(organization.locale || "en", {
          dateStyle: "long",
        }).format(member.createdAt ?? new Date()),
        selections: [...byCategory.entries()].map(([categoryName, groupNames]) => ({
          categoryName,
          groupNames,
        })),
        reviewUrl: `${getServerEnv().APP_URL.replace(/\/$/, "")}/admin/members`,
      }),
    });
  } catch (error) {
    console.error("[notifications] registration_submitted failed", error);
  }
}
