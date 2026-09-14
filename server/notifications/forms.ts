import { FormReminderEmail } from "@/emails/form-reminder-email";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import type { Event, Form, Organization } from "@/server/db/schema";
import { issueRsvpToken } from "@/server/lib/events/tokens";
import { formatEventWhen } from "@/server/notifications/events";
import type { PendingIdentity } from "@/server/queries/forms";
import { sendNotificationEmails } from "@/server/notifications/send";

const t = getDictionary();

/**
 * One reminder per pending identity. Members get a portal link (their
 * profile is what the form may write to, so the portal is the door);
 * externals and guests get a fresh token link on the linked event, minted
 * per send like invites. Called only after the manager confirmed the count.
 */
export async function sendFormReminders(params: {
  organization: Organization;
  form: Form;
  event: Event | null;
  recipients: PendingIdentity[];
  actorUserId: string;
}) {
  const { organization, form, event, recipients } = params;
  const locale = orgFormatLocale(organization.locale);

  const deadline = form.closesAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: organization.timezone }).format(
        form.closesAt,
      )
    : null;
  const eventWhen = event ? formatEventWhen(event, organization) : null;

  let sent = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    if (!recipient.email) {
      skipped += 1;
      continue;
    }

    let formUrl: string;
    let requiresSignIn: boolean;
    if (recipient.memberId || !event) {
      formUrl = buildAbsoluteAppUrl(`/portal/forms/${form.id}`);
      requiresSignIn = true;
    } else {
      const token = await issueRsvpToken({
        eventId: event.id,
        orgId: organization.id,
        externalEmail: recipient.email,
      });
      formUrl = buildAbsoluteAppUrl(`/events/rsvp/${token}/forms/${form.id}`);
      requiresSignIn = false;
    }

    await sendNotificationEmails({
      orgId: organization.id,
      kind: "form_reminder",
      eventId: event?.id ?? null,
      memberId: recipient.memberId,
      recipients: [
        {
          email: recipient.email,
          name: recipient.name,
          reason: recipient.memberId ? "member" : "applicant",
          memberId: recipient.memberId,
        },
      ],
      subject: t.emails.formReminder.subject(organization.name, form.title),
      metadata: { formId: form.id, eventId: event?.id ?? null, actorUserId: params.actorUserId },
      react: FormReminderEmail({
        organizationName: organization.name,
        recipientName: recipient.name ?? recipient.email,
        formTitle: form.title,
        eventTitle: event?.title ?? null,
        eventWhen,
        deadline,
        formUrl,
        requiresSignIn,
      }),
    });
    sent += 1;
  }

  return { sent, skipped };
}
