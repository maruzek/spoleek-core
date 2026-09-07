import type { ReactElement } from "react";

import type { EmailKind } from "@/server/db/schema";
import { recordNotificationEmail } from "@/server/lib/email-activity";
import { getResendClient, getResendFromEmail } from "@/server/lib/email";
import type { NotificationRecipient } from "@/server/notifications/recipients";

/**
 * The single door every admin notification goes through: one send and one
 * `email_activities` row per recipient, and never a thrown error — a broken
 * mailbox must not take down the action that triggered the notification.
 */
export async function sendNotificationEmails(params: {
  orgId: string;
  kind: EmailKind;
  recipients: NotificationRecipient[];
  subject: string;
  react: ReactElement;
  memberId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (params.recipients.length === 0) {
    return;
  }

  let resend: ReturnType<typeof getResendClient>;
  let fromEmail: string;

  try {
    resend = getResendClient();
    fromEmail = getResendFromEmail();
  } catch (error) {
    console.error(`[notifications] ${params.kind}: mailer unavailable`, error);
    return;
  }

  for (const recipient of params.recipients) {
    const metadata = {
      ...(params.metadata ?? {}),
      recipientReason: recipient.reason,
    };

    try {
      const result = await resend.emails.send({
        from: fromEmail,
        to: recipient.email,
        subject: params.subject,
        react: params.react,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      await recordNotificationEmail({
        orgId: params.orgId,
        kind: params.kind,
        // Per-recipient id wins: a broadcast has a different member per row.
        memberId: recipient.memberId ?? params.memberId ?? null,
        fromEmail,
        toEmail: recipient.email,
        toName: recipient.name,
        subject: params.subject,
        providerEmailId: result.data?.id ?? null,
        metadata,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown send error.";

      // Member id, never the address: this line lands in the host's log store,
      // which is retained under their policy rather than ours and sits outside
      // every retention rule we set. The address is one query away from the id.
      const subject = recipient.memberId ?? params.memberId ?? "unknown recipient";

      console.error(`[notifications] ${params.kind} → member ${subject}: ${message}`);

      await recordNotificationEmail({
        orgId: params.orgId,
        kind: params.kind,
        // Per-recipient id wins: a broadcast has a different member per row.
        memberId: recipient.memberId ?? params.memberId ?? null,
        fromEmail,
        toEmail: recipient.email,
        toName: recipient.name,
        subject: params.subject,
        error: message,
        metadata,
      }).catch(() => null);
    }
  }
}
