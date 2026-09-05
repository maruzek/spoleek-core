import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/server/db";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import {
  categoryAdminAssignments,
  groupCategories,
  groupMemberships,
  groupWorkspaceLinks,
  groups,
  organizations,
  tenantMembers,
} from "@/server/db/schema";

export type NotificationRecipient = {
  email: string;
  name: string | null;
  /** Why this address is on the list — surfaced in the email activity log. */
  reason:
    | "org_admin"
    | "org_address"
    | "category_admin"
    | "category_address"
    | "group_admin"
    | "group_address"
    | "workspace_group"
    | "applicant"
    | "account_owner";
};

/**
 * Collapses the list to one entry per address. The first reason wins, so the
 * order recipients are pushed in decides what the log shows for someone who is
 * both an org admin and a group admin.
 */
function dedupe(recipients: NotificationRecipient[]): NotificationRecipient[] {
  const seen = new Map<string, NotificationRecipient>();

  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase();

    if (!email || seen.has(email)) {
      continue;
    }

    seen.set(email, { ...recipient, email });
  }

  return [...seen.values()];
}

function memberName(member: { firstName: string; lastName: string }) {
  const name = `${member.firstName} ${member.lastName}`.trim();
  return name.length > 0 ? name : null;
}

/**
 * Who is told that someone applied to join the organization.
 *
 * Org admins are the baseline. Group and category admins are added only for the
 * groups the applicant actually picked, and only where the category opted in —
 * so a category that is not on the join form can never generate traffic.
 */
export async function resolveRegistrationRecipients(params: {
  orgId: string;
  groupIds: string[];
}): Promise<NotificationRecipient[]> {
  const [organization] = await db
    .select({
      emailNotifyRegistration: organizations.emailNotifyRegistration,
      emailNotifyRegistrationOrgAdmins: organizations.emailNotifyRegistrationOrgAdmins,
      registrationNotificationEmail: organizations.registrationNotificationEmail,
    })
    .from(organizations)
    .where(eq(organizations.id, params.orgId))
    .limit(1);

  if (!organization?.emailNotifyRegistration) {
    return [];
  }

  const recipients: NotificationRecipient[] = [];

  if (organization.emailNotifyRegistrationOrgAdmins) {
    const orgAdmins = await db
      .select({
        email: tenantMembers.email,
        firstName: tenantMembers.firstName,
        lastName: tenantMembers.lastName,
      })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.orgId, params.orgId),
          eq(tenantMembers.role, "org_admin"),
          eq(tenantMembers.status, "active"),
        ),
      );

    for (const admin of orgAdmins) {
      if (admin.email) {
        recipients.push({ email: admin.email, name: memberName(admin), reason: "org_admin" });
      }
    }
  }

  if (organization.registrationNotificationEmail) {
    recipients.push({
      email: organization.registrationNotificationEmail,
      name: null,
      reason: "org_address",
    });
  }

  if (params.groupIds.length === 0) {
    return dedupe(recipients);
  }

  const scopes = await db
    .select({
      groupId: groups.id,
      groupNotificationEmail: groups.notificationEmail,
      notifyViaWorkspaceGroup: groups.notifyViaWorkspaceGroup,
      workspaceGroupEmail: groupWorkspaceLinks.workspaceGroupEmail,
      workspaceLinkEnabled: groupWorkspaceLinks.isEnabled,
      categoryId: groupCategories.id,
      categoryNotificationEmail: groupCategories.notificationEmail,
    })
    .from(groups)
    .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
    .leftJoin(
      groupWorkspaceLinks,
      and(
        eq(groupWorkspaceLinks.groupId, groups.id),
        eq(groupWorkspaceLinks.orgId, groups.orgId),
      ),
    )
    .where(
      and(
        eq(groups.orgId, params.orgId),
        inArray(groups.id, params.groupIds),
        eq(groupCategories.notifyOnRegistration, true),
        eq(groupCategories.showInRegistration, true),
      ),
    );

  if (scopes.length === 0) {
    return dedupe(recipients);
  }

  // Groups whose alert goes to a Google group instead of to each admin. The
  // sync already puts group admins in that Google group, so mailing both would
  // deliver the same message twice.
  const groupIdsNeedingAdmins: string[] = [];

  for (const scope of scopes) {
    const viaWorkspace =
      scope.notifyViaWorkspaceGroup &&
      scope.workspaceLinkEnabled === true &&
      Boolean(scope.workspaceGroupEmail);

    if (viaWorkspace && scope.workspaceGroupEmail) {
      recipients.push({
        email: scope.workspaceGroupEmail,
        name: null,
        reason: "workspace_group",
      });
    } else {
      groupIdsNeedingAdmins.push(scope.groupId);
    }

    if (scope.groupNotificationEmail) {
      recipients.push({
        email: scope.groupNotificationEmail,
        name: null,
        reason: "group_address",
      });
    }
  }

  if (groupIdsNeedingAdmins.length > 0) {
    const groupAdmins = await db
      .select({
        email: tenantMembers.email,
        firstName: tenantMembers.firstName,
        lastName: tenantMembers.lastName,
      })
      .from(groupMemberships)
      .innerJoin(tenantMembers, eq(tenantMembers.id, groupMemberships.memberId))
      .where(
        and(
          eq(groupMemberships.orgId, params.orgId),
          inArray(groupMemberships.groupId, groupIdsNeedingAdmins),
          eq(groupMemberships.role, "group_admin"),
          eq(tenantMembers.status, "active"),
          ne(tenantMembers.status, "deleted"),
        ),
      );

    for (const admin of groupAdmins) {
      if (admin.email) {
        recipients.push({ email: admin.email, name: memberName(admin), reason: "group_admin" });
      }
    }
  }

  const categoryIds = [...new Set(scopes.map((scope) => scope.categoryId))];

  const categoryAdmins = await db
    .select({
      email: tenantMembers.email,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
    })
    .from(categoryAdminAssignments)
    .innerJoin(tenantMembers, eq(tenantMembers.id, categoryAdminAssignments.memberId))
    .where(
      and(
        eq(categoryAdminAssignments.orgId, params.orgId),
        inArray(categoryAdminAssignments.categoryId, categoryIds),
        eq(tenantMembers.status, "active"),
      ),
    );

  for (const admin of categoryAdmins) {
    if (admin.email) {
      recipients.push({ email: admin.email, name: memberName(admin), reason: "category_admin" });
    }
  }

  for (const scope of scopes) {
    if (scope.categoryNotificationEmail) {
      recipients.push({
        email: scope.categoryNotificationEmail,
        name: null,
        reason: "category_address",
      });
    }
  }

  return dedupe(recipients);
}


/**
 * Who is reminded that a group has not confirmed its members yet.
 *
 * Group admins and the admins of the fee-managing category, resolved through
 * `resolveMemberEmailForOrg` so a Workspace-first organization reaches people
 * at the address they actually read.
 *
 * A group with no admin at all falls back to the org admins, with the group
 * named in the subject. Sending nothing would let an unowned region miss the
 * deadline in silence, which is exactly the failure the reminders exist to
 * prevent — better that it surfaces to the board as a problem.
 */
export async function resolveReportReminderRecipients(params: {
  orgId: string;
  groupId: string;
  categoryId: string;
}): Promise<{
  recipients: NotificationRecipient[];
  /** True when nobody administers this group and the board was told instead. */
  fellBackToOrgAdmins: boolean;
}> {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, params.orgId))
    .limit(1);

  if (!organization) {
    return { recipients: [], fellBackToOrgAdmins: false };
  }

  const memberColumns = {
    email: tenantMembers.email,
    workspaceUserEmail: tenantMembers.workspaceUserEmail,
    preferredEmail: tenantMembers.preferredEmail,
    firstName: tenantMembers.firstName,
    lastName: tenantMembers.lastName,
  };

  const [groupAdmins, categoryAdmins] = await Promise.all([
    db
      .select(memberColumns)
      .from(groupMemberships)
      .innerJoin(tenantMembers, eq(groupMemberships.memberId, tenantMembers.id))
      .where(
        and(
          eq(groupMemberships.orgId, params.orgId),
          eq(groupMemberships.groupId, params.groupId),
          eq(groupMemberships.role, "group_admin"),
          eq(tenantMembers.status, "active"),
        ),
      ),
    db
      .select(memberColumns)
      .from(categoryAdminAssignments)
      .innerJoin(
        tenantMembers,
        eq(categoryAdminAssignments.memberId, tenantMembers.id),
      )
      .where(
        and(
          eq(categoryAdminAssignments.orgId, params.orgId),
          eq(categoryAdminAssignments.categoryId, params.categoryId),
          eq(tenantMembers.status, "active"),
        ),
      ),
  ]);

  const recipients: NotificationRecipient[] = [];

  const push = (
    rows: typeof groupAdmins,
    reason: NotificationRecipient["reason"],
  ) => {
    for (const row of rows) {
      const email = resolveMemberEmailForOrg({
        member: {
          email: row.email,
          workspaceUserEmail: row.workspaceUserEmail,
          preferredEmail: row.preferredEmail,
        },
        organization,
      });

      if (email) {
        recipients.push({ email, name: memberName(row), reason });
      }
    }
  };

  push(groupAdmins, "group_admin");
  push(categoryAdmins, "category_admin");

  if (recipients.length > 0) {
    return { recipients: dedupe(recipients), fellBackToOrgAdmins: false };
  }

  const orgAdmins = await db
    .select(memberColumns)
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, params.orgId),
        eq(tenantMembers.role, "org_admin"),
        eq(tenantMembers.status, "active"),
      ),
    );

  push(orgAdmins, "org_admin");

  return { recipients: dedupe(recipients), fellBackToOrgAdmins: true };
}

/** Org admins, for the board digest. */
export async function resolveBoardRecipients(
  orgId: string,
): Promise<NotificationRecipient[]> {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!organization) return [];

  const orgAdmins = await db
    .select({
      email: tenantMembers.email,
      workspaceUserEmail: tenantMembers.workspaceUserEmail,
      preferredEmail: tenantMembers.preferredEmail,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, orgId),
        eq(tenantMembers.role, "org_admin"),
        eq(tenantMembers.status, "active"),
      ),
    );

  const recipients: NotificationRecipient[] = [];

  for (const admin of orgAdmins) {
    const email = resolveMemberEmailForOrg({
      member: {
        email: admin.email,
        workspaceUserEmail: admin.workspaceUserEmail,
        preferredEmail: admin.preferredEmail,
      },
      organization,
    });

    if (email) {
      recipients.push({ email, name: memberName(admin), reason: "org_admin" });
    }
  }

  return dedupe(recipients);
}
