import { and, eq, inArray } from "drizzle-orm";

import { getServerEnv } from "@/lib/env";
import { RegistrationExistingAccountEmail } from "@/emails/registration-existing-account-email";
import { RegistrationReceivedEmail } from "@/emails/registration-received-email";
import { RegistrationRejectedEmail } from "@/emails/registration-rejected-email";
import { RegistrationSubmittedEmail } from "@/emails/registration-submitted-email";
import { db } from "@/server/db";
import {
  groupCategories,
  groups,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import { resolveRegistrationRecipients } from "@/server/notifications/recipients";
import { sendNotificationEmails } from "@/server/notifications/send";
import { listMemberAcknowledgements } from "@/server/queries/policies";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";

// The admin-facing "new application" notification below stays English on
// purpose: this pass covers the public surface only.
const t = getDictionary();

function appUrl(path: string) {
  return `${getServerEnv().APP_URL.replace(/\/$/, "")}${path}`;
}

function formatDate(date: Date, locale: string | null | undefined) {
  return new Intl.DateTimeFormat(orgFormatLocale(locale), {
    dateStyle: "long",
  }).format(date);
}

/**
 * The groups an applicant picked, grouped by category and ordered the way the
 * join form ordered them — a flat list of group names reads as noise once an
 * organization has more than one category.
 */
async function loadSelectionsByCategory(orgId: string, groupIds: string[]) {
  if (groupIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      groupName: groups.name,
      categoryName: groupCategories.name,
      categorySortOrder: groupCategories.sortOrder,
    })
    .from(groups)
    .innerJoin(groupCategories, eq(groupCategories.id, groups.categoryId))
    .where(and(eq(groups.orgId, orgId), inArray(groups.id, groupIds)));

  const byCategory = new Map<string, string[]>();

  for (const row of [...rows].sort((a, b) => a.categorySortOrder - b.categorySortOrder)) {
    byCategory.set(row.categoryName, [...(byCategory.get(row.categoryName) ?? []), row.groupName]);
  }

  return [...byCategory.entries()].map(([categoryName, groupNames]) => ({
    categoryName,
    groupNames,
  }));
}

async function loadApplicant(orgId: string, memberId: string) {
  const [organization] = await db
    .select({
      name: organizations.name,
      locale: organizations.locale,
      primaryEmail: organizations.primaryEmail,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [member] = await db
    .select({
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      createdAt: tenantMembers.createdAt,
    })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.id, memberId)))
    .limit(1);

  if (!organization || !member) {
    return null;
  }

  const displayName =
    `${member.firstName} ${member.lastName}`.trim() || (member.email ?? "New applicant");

  return { organization, member, displayName };
}

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

    const applicant = await loadApplicant(params.orgId, params.memberId);

    if (!applicant) {
      return;
    }

    const { organization, member, displayName } = applicant;
    const selections = await loadSelectionsByCategory(params.orgId, params.groupIds);

    await sendNotificationEmails({
      orgId: params.orgId,
      kind: "registration_submitted",
      memberId: params.memberId,
      recipients,
      subject: `New membership application — ${displayName}`,
      metadata: { groupIds: params.groupIds },
      react: RegistrationSubmittedEmail({
        organizationName: organization.name,
        applicantName: displayName,
        applicantEmail: member.email ?? "",
        submittedAt: formatDate(member.createdAt ?? new Date(), organization.locale),
        selections,
        reviewUrl: appUrl("/admin/members"),
      }),
    });
  } catch (error) {
    console.error("[notifications] registration_submitted failed", error);
  }
}

/**
 * Confirms to the applicant that their application arrived, and states which
 * policy version they accepted so the email itself is their record.
 */
export async function notifyRegistrationReceived(params: {
  orgId: string;
  memberId: string;
  groupIds: string[];
}) {
  try {
    const applicant = await loadApplicant(params.orgId, params.memberId);
    const toEmail = applicant?.member.email;

    if (!applicant || !toEmail) {
      return;
    }

    const { organization, member, displayName } = applicant;

    // Read back what the applicant actually acknowledged, not what is
    // configured now: a policy bump between the application and this send must
    // not rewrite the record the email states.
    const acknowledgements = await listMemberAcknowledgements(
      params.orgId,
      params.memberId,
    );
    // Pinned to the archived version URL, never to /legal/<slug>: the record is
    // only worth keeping if it still resolves to the text that was shown after
    // the document has moved on.
    const policies = acknowledgements
      .filter((row) => row.version !== null)
      .map((row) => ({
        title: row.documentTitle,
        version: row.version as string,
        url: appUrl(
          `/legal/${row.documentSlug}/v/${encodeURIComponent(row.version as string)}`,
        ),
      }));

    const selections = await loadSelectionsByCategory(params.orgId, params.groupIds);
    const submittedAt = formatDate(member.createdAt ?? new Date(), organization.locale);

    await sendNotificationEmails({
      orgId: params.orgId,
      kind: "registration_acknowledgement",
      memberId: params.memberId,
      recipients: [{ email: toEmail, name: displayName, reason: "applicant" }],
      subject: t.emails.received.subject(organization.name),
      metadata: {
        groupIds: params.groupIds,
        policyVersions: policies.map((policy) => policy.version),
      },
      react: RegistrationReceivedEmail({
        organizationName: organization.name,
        applicantName: displayName,
        submittedAt,
        selections,
        policies,
      }),
    });
  } catch (error) {
    console.error("[notifications] registration_acknowledgement failed", error);
  }
}

/**
 * Sent to the owner of an address that is already registered, in place of an
 * acknowledgement. The join form's response is identical either way, so this is
 * the only signal that the address was reused — and it reaches the owner, not
 * whoever submitted the form.
 */
export async function notifyRegistrationDuplicate(params: {
  orgId: string;
  memberId: string;
}) {
  try {
    const applicant = await loadApplicant(params.orgId, params.memberId);
    const toEmail = applicant?.member.email;

    if (!applicant || !toEmail) {
      return;
    }

    const { organization, displayName } = applicant;

    await sendNotificationEmails({
      orgId: params.orgId,
      kind: "registration_duplicate_notice",
      memberId: params.memberId,
      recipients: [{ email: toEmail, name: displayName, reason: "account_owner" }],
      subject: t.emails.existingAccount.subject(organization.name),
      react: RegistrationExistingAccountEmail({
        organizationName: organization.name,
        memberName: displayName,
        submittedAt: formatDate(new Date(), organization.locale),
        signInUrl: appUrl("/login"),
      }),
    });
  } catch (error) {
    console.error("[notifications] registration_duplicate_notice failed", error);
  }
}

/**
 * Tells an applicant their application was declined.
 *
 * Takes the applicant's details rather than an id, because by the time this runs
 * the member row is gone — rejection deletes it outright. The activity row is
 * written with no `memberId` for the same reason.
 */
export async function notifyRegistrationRejected(params: {
  orgId: string;
  applicantName: string;
  toEmail: string;
  reason: string | null;
}) {
  try {
    const [organization] = await db
      .select({
        name: organizations.name,
        locale: organizations.locale,
        primaryEmail: organizations.primaryEmail,
      })
      .from(organizations)
      .where(eq(organizations.id, params.orgId))
      .limit(1);

    if (!organization) {
      return;
    }

    await sendNotificationEmails({
      orgId: params.orgId,
      kind: "registration_rejected",
      recipients: [
        { email: params.toEmail, name: params.applicantName, reason: "applicant" },
      ],
      subject: t.emails.rejected.subject(organization.name),
      metadata: { hasReason: params.reason !== null },
      react: RegistrationRejectedEmail({
        organizationName: organization.name,
        applicantName: params.applicantName,
        decidedAt: formatDate(new Date(), organization.locale),
        reason: params.reason,
        contactEmail: organization.primaryEmail,
      }),
    });
  } catch (error) {
    console.error("[notifications] registration_rejected failed", error);
  }
}
