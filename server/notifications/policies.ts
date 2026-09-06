import { and, eq, isNull, ne } from "drizzle-orm";

import { PolicyVersionPublishedEmail } from "@/emails/policy-version-published-email";
import { getServerEnv } from "@/lib/env";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { db } from "@/server/db";
import {
  memberPolicyAcknowledgements,
  organizations,
  policyDocuments,
  policyVersions,
  tenantMembers,
} from "@/server/db/schema";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import type { NotificationRecipient } from "@/server/notifications/recipients";
import { sendNotificationEmails } from "@/server/notifications/send";

const t = getDictionary();

function appUrl(path: string) {
  return `${getServerEnv().APP_URL.replace(/\/$/, "")}${path}`;
}

/**
 * Who would receive a notification about this version, and at which address.
 *
 * Used twice: to show the count in the publish dialog before anything is
 * written, and to do the send. Same function both times, so the number the
 * admin approved is the number that gets mailed.
 *
 * A material version goes to everyone, because nobody has acknowledged it yet.
 * A non-material one goes only to members who have never been shown the
 * document at all — everyone else keeps a standing acknowledgement and does not
 * need to be interrupted.
 */
export async function resolvePolicyNotificationRecipients(params: {
  orgId: string;
  documentId: string;
  isMaterialChange: boolean;
}): Promise<NotificationRecipient[]> {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, params.orgId))
    .limit(1);

  if (!organization) {
    return [];
  }

  const members = await db
    .select({
      id: tenantMembers.id,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      workspaceUserEmail: tenantMembers.workspaceUserEmail,
      preferredEmail: tenantMembers.preferredEmail,
    })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.orgId, params.orgId),
        ne(tenantMembers.status, "deleted"),
        isNull(tenantMembers.deletedAt),
      ),
    );

  let eligible = members;

  if (!params.isMaterialChange) {
    const seen = await db
      .select({ memberId: memberPolicyAcknowledgements.memberId })
      .from(memberPolicyAcknowledgements)
      .innerJoin(
        policyVersions,
        eq(policyVersions.id, memberPolicyAcknowledgements.policyVersionId),
      )
      .where(
        and(
          eq(memberPolicyAcknowledgements.orgId, params.orgId),
          eq(policyVersions.documentId, params.documentId),
        ),
      );

    const seenIds = new Set(seen.map((row) => row.memberId));
    eligible = members.filter((member) => !seenIds.has(member.id));
  }

  const recipients: NotificationRecipient[] = [];

  for (const member of eligible) {
    const email = resolveMemberEmailForOrg({ member, organization });

    // A member with no usable address is not an error worth failing the publish
    // over: they are still stopped by the portal gate, which is the control that
    // actually matters. The gap shows up in the audience count in the dialog.
    if (!email) {
      continue;
    }

    const name = `${member.firstName} ${member.lastName}`.trim();

    recipients.push({
      email,
      name: name.length > 0 ? name : null,
      reason: "member",
      memberId: member.id,
    });
  }

  return recipients;
}

/**
 * Mails members about a newly published version.
 *
 * Only ever called because an admin ticked the box on the publish dialog. There
 * is deliberately no automatic trigger: an accidental blast to the entire
 * membership of a political organization is not something you recover from
 * socially, so the decision stays a human one every time.
 */
export async function notifyPolicyVersionPublished(params: {
  orgId: string;
  documentId: string;
  versionId: string;
}) {
  try {
    const [row] = await db
      .select({
        organizationName: organizations.name,
        locale: organizations.locale,
        documentTitle: policyDocuments.title,
        slug: policyDocuments.slug,
        version: policyVersions.version,
        effectiveFrom: policyVersions.effectiveFrom,
        summaryOfChanges: policyVersions.summaryOfChanges,
        isMaterialChange: policyVersions.isMaterialChange,
      })
      .from(policyVersions)
      .innerJoin(policyDocuments, eq(policyDocuments.id, policyVersions.documentId))
      .innerJoin(organizations, eq(organizations.id, policyDocuments.orgId))
      .where(eq(policyVersions.id, params.versionId))
      .limit(1);

    if (!row || !row.version) {
      return;
    }

    const recipients = await resolvePolicyNotificationRecipients({
      orgId: params.orgId,
      documentId: params.documentId,
      isMaterialChange: row.isMaterialChange,
    });

    if (recipients.length === 0) {
      return;
    }

    const versionUrl = appUrl(
      `/legal/${row.slug}/v/${encodeURIComponent(row.version)}`,
    );
    const effectiveFrom = new Intl.DateTimeFormat(orgFormatLocale(row.locale), {
      dateStyle: "long",
    }).format(row.effectiveFrom ?? new Date());

    // One send per member: the greeting is personal and each activity row has to
    // name the member it reached, which a single bulk send cannot express.
    for (const recipient of recipients) {
      await sendNotificationEmails({
        orgId: params.orgId,
        kind: "policy_version_published",
        recipients: [recipient],
        subject: t.emails.policyPublished.subject(
          row.organizationName,
          row.documentTitle,
        ),
        metadata: {
          documentId: params.documentId,
          versionId: params.versionId,
          version: row.version,
          isMaterialChange: row.isMaterialChange,
        },
        react: PolicyVersionPublishedEmail({
          organizationName: row.organizationName,
          memberName: recipient.name ?? recipient.email,
          documentTitle: row.documentTitle,
          version: row.version,
          effectiveFrom,
          summaryOfChanges: row.summaryOfChanges,
          versionUrl,
          actionRequired: row.isMaterialChange,
        }),
      });
    }
  } catch (error) {
    // Never let a mailer problem surface as a failed publish: the version is
    // already in force and the portal gate enforces it regardless.
    console.error("[notifications] policy_version_published failed", error);
  }
}
