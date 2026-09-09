import { eq } from "drizzle-orm";

import { MembershipDeletedEmail } from "@/emails/membership-deleted-email";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema";
import { sendNotificationEmails } from "@/server/notifications/send";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";

const t = getDictionary();

function formatDate(date: Date, locale: string | null | undefined) {
  return new Intl.DateTimeFormat(orgFormatLocale(locale), {
    dateStyle: "long",
  }).format(date);
}

/**
 * Tells a member their membership has been deleted.
 *
 * Takes the member's details rather than an id and reads nothing back, because
 * the caller has just written the row and because the one thing this email must
 * not do is depend on data that is on its way out.
 *
 * **Sent to the personal address, never only to the Workspace one.** The whole
 * point of the message is that the Workspace address is about to be deleted;
 * delivering the warning there and nowhere else would work exactly until it
 * mattered. A member with no personal address on file gets nothing, and that is
 * a gap worth knowing about rather than papering over with the address that is
 * being withdrawn.
 *
 * `memberId` is passed through so the `email_activities` row points at the
 * person — for the ~30 days before the purge takes both.
 */
export async function notifyMembershipDeleted(params: {
  orgId: string;
  memberId: string;
  memberName: string;
  /** The member's personal address. Nothing is sent when it is null. */
  toEmail: string | null;
  workspaceEmail: string | null;
  deletedAt: Date;
  purgeAfter: Date | null;
}) {
  if (!params.toEmail) {
    console.warn(
      "[notifications] membership_deleted skipped: member has no personal email",
      { memberId: params.memberId, orgId: params.orgId },
    );
    return;
  }

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

    // A deletion with no anchor should not have happened, but the email must
    // still say something true rather than "undefined".
    if (!params.purgeAfter) {
      console.warn(
        "[notifications] membership_deleted: no purge date on the member",
        { memberId: params.memberId, orgId: params.orgId },
      );
      return;
    }

    await sendNotificationEmails({
      orgId: params.orgId,
      kind: "membership_deleted",
      memberId: params.memberId,
      recipients: [
        {
          email: params.toEmail,
          name: params.memberName,
          reason: "member",
          memberId: params.memberId,
        },
      ],
      subject: t.emails.membershipDeleted.subject(organization.name),
      metadata: { hasWorkspaceAccount: params.workspaceEmail !== null },
      react: MembershipDeletedEmail({
        organizationName: organization.name,
        memberName: params.memberName,
        deletedAt: formatDate(params.deletedAt, organization.locale),
        purgeAfter: formatDate(params.purgeAfter, organization.locale),
        workspaceEmail: params.workspaceEmail,
        contactEmail: organization.primaryEmail,
      }),
    });
  } catch (error) {
    console.error("[notifications] membership_deleted failed", error);
  }
}
