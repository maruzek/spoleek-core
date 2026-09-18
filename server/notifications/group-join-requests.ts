import { and, eq } from "drizzle-orm";

import { GroupJoinDecisionEmail } from "@/emails/group-join-decision-email";
import { GroupJoinRequestEmail } from "@/emails/group-join-request-email";
import { getServerEnv } from "@/lib/env";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { db } from "@/server/db";
import { groups, organizations, tenantMembers } from "@/server/db/schema";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import { resolveJoinRequestRecipients } from "@/server/notifications/recipients";
import { sendNotificationEmails } from "@/server/notifications/send";

const t = getDictionary();

function appUrl(path: string) {
  return `${getServerEnv().APP_URL.replace(/\/$/, "")}${path}`;
}

function formatDate(date: Date, locale: string | null | undefined) {
  return new Intl.DateTimeFormat(orgFormatLocale(locale), { dateStyle: "long" }).format(date);
}

async function loadContext(orgId: string, groupId: string, memberId: string) {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [group] = await db
    .select({ id: groups.id, name: groups.name, categoryId: groups.categoryId })
    .from(groups)
    .where(and(eq(groups.orgId, orgId), eq(groups.id, groupId)))
    .limit(1);

  const [member] = await db
    .select({
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      workspaceUserEmail: tenantMembers.workspaceUserEmail,
      preferredEmail: tenantMembers.preferredEmail,
    })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.id, memberId)))
    .limit(1);

  if (!organization || !group || !member) {
    return null;
  }

  const displayName = `${member.firstName} ${member.lastName}`.trim() || member.email || "A member";

  return { organization, group, member, displayName };
}

/**
 * Tells whoever can approve that a member asked to join. Resolves its own
 * recipients (and the org switch) and swallows failures: a mail problem must
 * never turn a saved request into an error for the member.
 */
export async function notifyJoinRequested(params: {
  orgId: string;
  groupId: string;
  memberId: string;
  message: string | null;
}) {
  try {
    const recipients = await resolveJoinRequestRecipients({
      orgId: params.orgId,
      groupId: params.groupId,
    });

    if (recipients.length === 0) {
      return;
    }

    const context = await loadContext(params.orgId, params.groupId, params.memberId);

    if (!context) {
      return;
    }

    const { organization, group, member, displayName } = context;

    await sendNotificationEmails({
      orgId: params.orgId,
      kind: "group_join_requested",
      memberId: params.memberId,
      recipients,
      subject: t.emails.joinRequest.subject(displayName, group.name),
      metadata: { groupId: group.id, hasMessage: params.message !== null },
      react: GroupJoinRequestEmail({
        organizationName: organization.name,
        memberName: displayName,
        memberEmail: member.email ?? "",
        groupName: group.name,
        requestedAt: formatDate(new Date(), organization.locale),
        message: params.message,
        reviewUrl: appUrl(`/admin/groups/${group.categoryId}/${group.id}?tab=requests`),
      }),
    });
  } catch (error) {
    console.error("[notifications] group_join_requested failed", error);
  }
}

/** Tells the member what the leaders decided, when the org wants that. */
export async function notifyJoinDecided(params: {
  orgId: string;
  groupId: string;
  memberId: string;
  decision: "approve" | "decline";
  reason: string | null;
}) {
  try {
    const context = await loadContext(params.orgId, params.groupId, params.memberId);

    if (!context || !context.organization.emailNotifyJoinDecision) {
      return;
    }

    const { organization, group, member, displayName } = context;
    const toEmail = resolveMemberEmailForOrg({ member, organization });

    if (!toEmail) {
      return;
    }

    const copy = t.emails.joinDecision;

    await sendNotificationEmails({
      orgId: params.orgId,
      kind: "group_join_decided",
      memberId: params.memberId,
      recipients: [{ email: toEmail, name: displayName, reason: "member" }],
      subject:
        params.decision === "approve"
          ? copy.approvedSubject(group.name)
          : copy.declinedSubject(group.name),
      metadata: { groupId: group.id, decision: params.decision, hasReason: params.reason !== null },
      react: GroupJoinDecisionEmail({
        organizationName: organization.name,
        memberName: displayName,
        groupName: group.name,
        decision: params.decision,
        decidedAt: formatDate(new Date(), organization.locale),
        reason: params.reason,
        portalUrl: appUrl("/portal/groups"),
      }),
    });
  } catch (error) {
    console.error("[notifications] group_join_decided failed", error);
  }
}
