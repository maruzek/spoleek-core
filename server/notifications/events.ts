import { EventInviteEmail } from "@/emails/event-invite-email";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { getDictionary, orgFormatLocale } from "@/lib/i18n";
import { issueRsvpToken } from "@/server/lib/events/tokens";
import type { Event, Organization } from "@/server/db/schema";
import type { EventRecipient } from "@/server/queries/events";
import { sendNotificationEmails } from "@/server/notifications/send";

const t = getDictionary();

/** Plain-text excerpt of the sanitized description for the email body. */
function excerptOf(html: string | null, max = 240) {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length === 0) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function formatEventWhen(
  event: Pick<Event, "startsAt" | "endsAt" | "allDay">,
  organization: Pick<Organization, "locale" | "timezone">,
) {
  if (!event.startsAt) return null;

  const locale = orgFormatLocale(organization.locale);
  const options: Intl.DateTimeFormatOptions = event.allDay
    ? { dateStyle: "long", timeZone: organization.timezone }
    : { dateStyle: "long", timeStyle: "short", timeZone: organization.timezone };
  const format = new Intl.DateTimeFormat(locale, options);

  if (!event.endsAt) return format.format(event.startsAt);
  return format.formatRange(event.startsAt, event.endsAt);
}

/**
 * Sends one invite per recipient, minting a fresh token each. Called only by
 * `sendEventInviteEmails` after the manager confirmed the recipient count.
 * Never throws for a mailer problem — `sendNotificationEmails` records the
 * failure per recipient instead.
 */
export async function sendEventInvites(params: {
  organization: Organization;
  event: Event;
  recipients: EventRecipient[];
  actorUserId: string;
}) {
  const { organization, event, recipients } = params;
  const locale = orgFormatLocale(organization.locale);

  const when = formatEventWhen(event, organization);
  const where = [event.locationName, event.locationAddress].filter(Boolean).join(", ") || null;
  const excerpt = excerptOf(event.descriptionHtml);
  const deadline = event.rsvpDeadlineAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeZone: organization.timezone,
      }).format(event.rsvpDeadlineAt)
    : null;

  for (const recipient of recipients) {
    const holder = recipient.memberId
      ? { memberId: recipient.memberId }
      : { externalEmail: recipient.email };
    const token = await issueRsvpToken({ eventId: event.id, orgId: organization.id, ...holder });

    await sendNotificationEmails({
      orgId: organization.id,
      kind: "event_invite",
      eventId: event.id,
      recipients: [
        {
          email: recipient.email,
          name: recipient.name,
          reason: recipient.memberId ? "member" : "applicant",
          memberId: recipient.memberId ?? null,
        },
      ],
      subject: t.emails.eventInvite.subject(organization.name, event.title),
      metadata: { eventId: event.id, actorUserId: params.actorUserId },
      react: EventInviteEmail({
        organizationName: organization.name,
        recipientName: recipient.name ?? recipient.email,
        eventTitle: event.title,
        when,
        where,
        excerpt,
        deadline,
        rsvpUrl: buildAbsoluteAppUrl(`/events/rsvp/${token}`),
        communicationLink: event.communicationLink,
      }),
    });
  }
}
