import { eq } from "drizzle-orm";

import { EventPaymentEmail } from "@/emails/event-payment-email";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { formatLongDate } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { feeAmountToDecimal } from "@/lib/payments";
import { db } from "@/server/db";
import {
  eventResponses,
  events,
  memberPayments,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import { issueRsvpToken } from "@/server/lib/events/tokens";
import { resolvePaymentRecipient } from "@/server/lib/payment-status";
import { PAYMENT_QR_GRACE_DAYS, buildPaymentQrUrl } from "@/server/lib/payment-qr";
import { sendEmail } from "@/server/notifications/send";

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * The "here is your payment" email after a confirmed yes created or re-priced
 * a payment. Called via `after()` outside the RSVP transaction; a refused
 * send is logged by the mailer door and never reaches the RSVP.
 *
 * Members land on the portal event page; guests and token holders get their
 * RSVP token page, which is the only place they can see the payment. A guest
 * whose RSVP has been shredded has nobody to write to and is skipped.
 *
 * `rsvpToken` is the raw token the responder just used (or was just issued),
 * when the caller has it. Tokens are stored hashed, so without one a fresh
 * token is minted for non-account recipients — exactly what a re-sent invite
 * does, and the old link stops working the same way.
 */
export async function sendEventPaymentEmail(
  paymentId: string,
  options: { updated: boolean; rsvpToken?: string | null },
): Promise<void> {
  try {
    const [row] = await db
      .select({
        orgId: memberPayments.orgId,
        memberId: memberPayments.memberId,
        responseId: memberPayments.responseId,
        amount: memberPayments.amount,
        currency: memberPayments.currency,
        bankAccount: memberPayments.bankAccount,
        variableSymbol: memberPayments.variableSymbol,
        dueAt: memberPayments.dueAt,
        eventId: events.id,
        eventTitle: events.title,
        eventSlug: events.slug,
        memberEmail: tenantMembers.email,
        memberWorkspaceEmail: tenantMembers.workspaceUserEmail,
        memberPreferredEmail: tenantMembers.preferredEmail,
        memberFirstName: tenantMembers.firstName,
        memberLastName: tenantMembers.lastName,
        memberUserId: tenantMembers.userId,
        guestEmail: eventResponses.guestEmail,
        guestName: eventResponses.guestName,
        orgName: organizations.name,
        defaultEmailPreference: organizations.defaultEmailPreference,
        workspaceModuleEnabled: organizations.workspaceModuleEnabled,
        workspaceConnectedAt: organizations.workspaceConnectedAt,
        workspaceDomain: organizations.workspaceDomain,
      })
      .from(memberPayments)
      .innerJoin(events, eq(memberPayments.eventId, events.id))
      .innerJoin(organizations, eq(memberPayments.orgId, organizations.id))
      .leftJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
      .leftJoin(eventResponses, eq(memberPayments.responseId, eventResponses.id))
      .where(eq(memberPayments.id, paymentId))
      .limit(1);

    if (!row) return;

    const recipient = resolvePaymentRecipient(row);
    if (!recipient) return;

    const link = await resolveEventLink(row, options.rsvpToken ?? null);
    if (!link) return;

    const copy = getDictionary().emails.eventPayment;

    await sendEmail({
      orgId: row.orgId,
      kind: "event_payment",
      to: { email: recipient.email, name: recipient.name, memberId: row.memberId },
      eventId: row.eventId,
      metadata: { paymentId, updated: options.updated },
      subject: options.updated ? copy.updatedSubject(row.eventTitle) : copy.subject(row.eventTitle),
      react: EventPaymentEmail({
        organizationName: row.orgName,
        recipientName: recipient.name,
        eventTitle: row.eventTitle,
        amount: feeAmountToDecimal(row.amount),
        currency: row.currency,
        dueAt: formatLongDate(row.dueAt),
        paymentDetails: {
          bankAccount: row.bankAccount,
          variableSymbol: row.variableSymbol,
          qrUrl: row.bankAccount
            ? buildPaymentQrUrl(paymentId, addDays(row.dueAt, PAYMENT_QR_GRACE_DAYS))
            : null,
        },
        link,
        updated: options.updated,
      }),
    });
  } catch {
    // Loading the payment or minting the token failed; the send itself never throws.
  }
}

/**
 * Members with an account use the portal; everyone else needs their RSVP
 * token. A member with a token but no account (shadow account) also gets the
 * token page — the portal would only ask them to sign in.
 */
async function resolveEventLink(
  row: {
    orgId: string;
    eventId: string;
    eventSlug: string;
    memberId: string | null;
    memberUserId: string | null;
    guestEmail: string | null;
  },
  knownToken: string | null,
): Promise<string | null> {
  if (row.memberId && row.memberUserId) {
    return buildAbsoluteAppUrl(`/portal/events/${row.eventSlug}`);
  }

  const token =
    knownToken ??
    (row.memberId
      ? await issueRsvpToken({ eventId: row.eventId, orgId: row.orgId, memberId: row.memberId })
      : row.guestEmail
        ? await issueRsvpToken({
            eventId: row.eventId,
            orgId: row.orgId,
            externalEmail: row.guestEmail,
          })
        : null);

  return token ? buildAbsoluteAppUrl(`/events/rsvp/${token}`) : null;
}
