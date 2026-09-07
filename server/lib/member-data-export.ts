import { and, asc, desc, eq } from "drizzle-orm";

import { getServerEnv } from "@/lib/env";
import { db } from "@/server/db";
import {
  categoryAdminAssignments,
  emailActivities,
  groupCategories,
  groupMemberships,
  groups,
  memberAuthEvents,
  memberCustomFieldValues,
  memberCustomFields,
  memberInvites,
  memberPayments,
  membershipReportGroups,
  membershipReportMembers,
  membershipReports,
  organizations,
  tenantMembers,
  users,
  workspaceGroupMemberLinks,
  workspaceSyncOperations,
} from "@/server/db/schema";
import { listMemberAcknowledgements } from "@/server/queries/policies";

/**
 * Everything the organization holds about one member, in one machine-readable
 * document.
 *
 * Assembling this by hand across thirteen tables under a one-month deadline is
 * not realistic, and doing it by hand means doing it differently every time —
 * which is the actual risk, because an access request answered inconsistently
 * is worse evidence than one answered late.
 *
 * Two rules shape what goes in:
 *
 * - **Every table carrying a `member_id` is represented**, even when the answer
 *   is an empty array. A section that is missing entirely cannot be told apart
 *   from one that was forgotten, and "we don't hold any" is itself an answer.
 * - **Secrets are described, never disclosed.** Invite token hashes, password
 *   hashes and OAuth tokens are data *about* the member that would compromise
 *   them if handed over, so the export reports that an invite exists and what
 *   state it is in, not the token.
 *
 * Art. 15 is more than the rows: the reply has to state purposes, recipients,
 * retention and the rights available. Those live in `context` below so the file
 * is a complete answer rather than a database dump the member has to interpret.
 */
export type MemberDataExport = Awaited<ReturnType<typeof buildMemberDataExport>>;

/** Ties an acknowledgement to the exact text, which is the point of the record. */
function buildArchivedPolicyUrl(slug: string, version: string | null) {
  const { APP_URL } = getServerEnv();
  const base = APP_URL.replace(/\/$/, "");

  return version ? `${base}/legal/${slug}/v/${version}` : `${base}/legal/${slug}`;
}

export async function buildMemberDataExport({
  orgId,
  memberId,
  generatedAt = new Date(),
}: {
  orgId: string;
  memberId: string;
  generatedAt?: Date;
}) {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.id, memberId)))
    .limit(1);

  if (!member) {
    return null;
  }

  const [organization] = await db
    .select({
      name: organizations.name,
      legalName: organizations.legalName,
      primaryEmail: organizations.primaryEmail,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [
    account,
    customFieldAnswers,
    groupAssignments,
    categoryAdminRoles,
    acknowledgements,
    payments,
    emails,
    authEvents,
    invite,
    workspaceLinks,
    pendingWorkspaceOperations,
    reportAppearances,
    reportSubmissions,
  ] = await Promise.all([
    member.userId
      ? db
          .select({
            name: users.name,
            email: users.email,
            emailVerified: users.emailVerified,
            image: users.image,
            systemRole: users.systemRole,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, member.userId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),

    db
      .select({
        key: memberCustomFields.key,
        label: memberCustomFields.label,
        type: memberCustomFields.type,
        value: memberCustomFieldValues.value,
        updatedAt: memberCustomFieldValues.updatedAt,
      })
      .from(memberCustomFieldValues)
      .innerJoin(
        memberCustomFields,
        eq(memberCustomFields.id, memberCustomFieldValues.fieldId),
      )
      .where(eq(memberCustomFieldValues.memberId, memberId))
      .orderBy(asc(memberCustomFields.sortOrder)),

    db
      .select({
        groupName: groups.name,
        categoryName: groupCategories.name,
        role: groupMemberships.role,
        joinedAt: groupMemberships.createdAt,
      })
      .from(groupMemberships)
      .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
      .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
      .where(eq(groupMemberships.memberId, memberId))
      .orderBy(asc(groups.name)),

    db
      .select({
        categoryName: groupCategories.name,
        assignedAt: categoryAdminAssignments.createdAt,
      })
      .from(categoryAdminAssignments)
      .innerJoin(
        groupCategories,
        eq(groupCategories.id, categoryAdminAssignments.categoryId),
      )
      .where(eq(categoryAdminAssignments.memberId, memberId)),

    listMemberAcknowledgements(orgId, memberId),

    db
      .select({
        type: memberPayments.type,
        status: memberPayments.status,
        amount: memberPayments.amount,
        currency: memberPayments.currency,
        periodLabel: memberPayments.periodLabel,
        variableSymbol: memberPayments.variableSymbol,
        dueAt: memberPayments.dueAt,
        paidAt: memberPayments.paidAt,
        adminNote: memberPayments.adminNote,
        notes: memberPayments.notes,
        cancellationReason: memberPayments.cancellationReason,
      })
      .from(memberPayments)
      .where(eq(memberPayments.memberId, memberId))
      .orderBy(desc(memberPayments.dueAt)),

    // Metadata only — Spoleek never stores message bodies. They live with
    // Resend for as long as their own retention window allows.
    db
      .select({
        kind: emailActivities.kind,
        subject: emailActivities.subject,
        toEmail: emailActivities.toEmail,
        status: emailActivities.currentStatus,
        sentAt: emailActivities.sentAt,
        deliveredAt: emailActivities.deliveredAt,
      })
      .from(emailActivities)
      .where(eq(emailActivities.memberId, memberId))
      .orderBy(desc(emailActivities.lastStatusAt)),

    db
      .select({
        eventType: memberAuthEvents.eventType,
        message: memberAuthEvents.message,
        occurredAt: memberAuthEvents.createdAt,
      })
      .from(memberAuthEvents)
      .where(eq(memberAuthEvents.memberId, memberId))
      .orderBy(desc(memberAuthEvents.createdAt)),

    // Deliberately no `tokenHash`: an activation token is data about this
    // member that would let anyone holding the file take over their account.
    db
      .select({
        status: memberInvites.status,
        deliveryStatus: memberInvites.deliveryStatus,
        sentAt: memberInvites.sentAt,
        completedAt: memberInvites.completedAt,
        resendCount: memberInvites.resendCount,
      })
      .from(memberInvites)
      .where(eq(memberInvites.memberId, memberId))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    db
      .select({
        address: workspaceGroupMemberLinks.address,
        workspaceGroupId: workspaceGroupMemberLinks.workspaceGroupId,
        createdAt: workspaceGroupMemberLinks.createdAt,
      })
      .from(workspaceGroupMemberLinks)
      .where(eq(workspaceGroupMemberLinks.memberId, memberId)),

    db
      .select({
        kind: workspaceSyncOperations.kind,
        address: workspaceSyncOperations.address,
        status: workspaceSyncOperations.status,
        createdAt: workspaceSyncOperations.createdAt,
      })
      .from(workspaceSyncOperations)
      .where(eq(workspaceSyncOperations.memberId, memberId)),

    db
      .select({
        periodLabel: membershipReports.periodLabel,
        confirmationBasis: membershipReportMembers.confirmationBasis,
        included: membershipReportMembers.included,
        note: membershipReportMembers.note,
        feeAmountCents: membershipReportMembers.feeAmountCents,
        currency: membershipReportMembers.currency,
      })
      .from(membershipReportMembers)
      .innerJoin(
        membershipReportGroups,
        eq(membershipReportGroups.id, membershipReportMembers.reportGroupId),
      )
      .innerJoin(
        membershipReports,
        eq(membershipReports.id, membershipReportGroups.reportId),
      )
      .where(eq(membershipReportMembers.memberId, memberId)),

    // Their own actions as a group admin, which is data about them too.
    db
      .select({
        periodLabel: membershipReports.periodLabel,
        status: membershipReportGroups.status,
        submittedAt: membershipReportGroups.submittedAt,
      })
      .from(membershipReportGroups)
      .innerJoin(
        membershipReports,
        eq(membershipReports.id, membershipReportGroups.reportId),
      )
      .where(eq(membershipReportGroups.submittedByMemberId, memberId)),
  ]);

  return {
    context: {
      generatedAt: generatedAt.toISOString(),
      subject: "A copy of the personal data held about you (GDPR Art. 15 and 20).",
      controller: {
        name: organization?.legalName || organization?.name || null,
        contact: organization?.primaryEmail ?? null,
      },
      lawfulBases: [
        "Art. 6(1)(b) — necessary for the membership relationship.",
        "Art. 6(1)(c) — legal obligation to maintain a member list.",
        "Art. 9(2)(d) — membership of a political organization reveals political opinions, processed under the not-for-profit-body exemption, on condition the data is not disclosed outside the organization without your consent.",
      ],
      recipients:
        "Service providers processing this data on the organization's instructions: the application host, the database host, the email provider, and Google Workspace where that module is enabled.",
      yourRights:
        "Rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), and objection (Art. 21). Erasure is limited where the organization is legally required to keep a member list. Contact the organization at the address above.",
      notes: [
        "Email records are metadata only — the organization does not store message bodies.",
        "Security material held about you (activation tokens, password hashes, sign-in tokens) is deliberately excluded: disclosing it would let anyone holding this file access your account.",
      ],
    },

    member: {
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      role: member.role,
      status: member.status,
      preferredEmail: member.preferredEmail,
      workspaceUserEmail: member.workspaceUserEmail,
      workspaceProvisionedAt: member.workspaceProvisionedAt,
      joinedAt: member.createdAt,
      lastUpdatedAt: member.updatedAt,
      deletedAt: member.deletedAt,
    },

    account,
    customFieldAnswers,
    groupAssignments,
    categoryAdminRoles,

    policyAcknowledgements: acknowledgements.map((entry) => ({
      document: entry.documentTitle,
      version: entry.version,
      acknowledgedAt: entry.acknowledgedAt,
      // "Accepted" and "confirmed having read" are different acts and the
      // record has to say which.
      act: entry.requiresAcceptance ? "accepted" : "confirmed having read",
      method: entry.method,
      text: buildArchivedPolicyUrl(entry.documentSlug, entry.version),
    })),

    payments,
    emails,
    authEvents,
    invite,
    workspaceLinks,
    pendingWorkspaceOperations,
    membershipReports: reportAppearances,
    membershipReportSubmissions: reportSubmissions,
  };
}

/** Stable, readable filename — this is something a person saves and sends on. */
export function buildMemberDataExportFilename(
  member: { firstName: string; lastName: string },
  generatedAt = new Date(),
) {
  const name = [member.firstName, member.lastName]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const date = generatedAt.toISOString().slice(0, 10);

  return `${name || "member"}-data-export-${date}.json`;
}
