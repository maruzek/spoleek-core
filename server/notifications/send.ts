import type { ReactElement } from "react";
import { Resend } from "resend";

import { getServerEnv } from "@/lib/env";
import type { EmailKind } from "@/server/db/schema";
import {
  getEmailActivityByProviderEmailId,
  recordEmailActivity,
} from "@/server/lib/email-activity";
import type { NotificationRecipient } from "@/server/notifications/recipients";

/**
 * The mailer: the only module that knows Resend exists.
 *
 * Two things live here on purpose. The **adapter** (`Mailer`) is the seam —
 * Resend in production, an in-memory list in tests — and the **door**
 * (`sendEmail`) is the one function every outbound mail goes through, so a
 * send and its `email_activities` row cannot come apart. Nothing else in the
 * codebase imports the Resend SDK; the webhook route verifies its payload
 * through `verifyResendWebhook` below.
 */

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export type OutboundEmail = {
  from: string;
  to: string;
  subject: string;
  react?: ReactElement;
  text?: string;
  /** Provider-side dedupe key: a retry with the same key sends nothing new. */
  idempotencyKey?: string;
};

export type SentEmailCopy = {
  html: string | null;
  text: string | null;
  subject: string | null;
};

export type ProviderAccount = {
  domains: {
    id: string;
    name: string;
    status: string;
    region: string;
    records: { record: string; type: string; name: string; status: string }[];
  }[];
  webhooks: { id: string; endpoint: string; status: string; events: string[] }[];
  /** Last event on each of the most recent emails across the whole account. */
  recentEmails: { lastEvent: string }[];
};

export type Mailer = {
  /** Delivers one message and resolves with the provider's id, or throws. */
  send(email: OutboundEmail): Promise<{ id: string | null }>;
  /** The rendered copy the provider still holds; null once it has aged out. */
  fetchCopy(providerEmailId: string): Promise<SentEmailCopy | null>;
  /** Account-wide view for the system-admin health page. */
  inspectAccount(): Promise<ProviderAccount>;
};

let cachedResend: Resend | null = null;

function getResendClient() {
  if (cachedResend) {
    return cachedResend;
  }

  const env = getServerEnv();

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send email.");
  }

  cachedResend = new Resend(env.RESEND_API_KEY);
  return cachedResend;
}

export function getResendFromEmail() {
  const env = getServerEnv();
  const from = env.RESEND_FROM_EMAIL ?? env.SMTP_FROM;

  if (!from) {
    throw new Error("RESEND_FROM_EMAIL or SMTP_FROM is required to send email.");
  }
  //todo: import name from .env
  return `Karel Botenberg<${from}>`;
}

const resendMailer: Mailer = {
  async send(email) {
    const { data, error } = await getResendClient().emails.send(
      {
        from: email.from,
        to: [email.to],
        subject: email.subject,
        ...(email.react ? { react: email.react } : { text: email.text ?? "" }),
      },
      email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined,
    );

    if (error) {
      throw new Error(error.message);
    }

    return { id: data?.id ?? null };
  },

  async fetchCopy(providerEmailId) {
    const { data, error } = await getResendClient().emails.get(providerEmailId);

    if (error || !data) {
      return null;
    }

    return {
      html: data.html?.trim() || null,
      text: data.text?.trim() || null,
      subject: data.subject ?? null,
    };
  },

  async inspectAccount() {
    const resend = getResendClient();
    const [domainList, webhookList, emailList] = await Promise.all([
      resend.domains.list(),
      resend.webhooks.list(),
      resend.emails.list({ limit: 100 }),
    ]);

    const firstError = domainList.error ?? webhookList.error ?? emailList.error;
    if (firstError) {
      throw new Error(firstError.message);
    }

    // The list endpoint omits DNS records; one extra call per domain fills them in.
    const domains = await Promise.all(
      (domainList.data?.data ?? []).map(async (domain) => {
        const detail = await resend.domains.get(domain.id);
        return {
          id: domain.id,
          name: domain.name,
          status: domain.status,
          region: domain.region,
          records: (detail.data?.records ?? []).map((record) => ({
            record: record.record,
            type: record.type,
            name: record.name,
            status: record.status,
          })),
        };
      }),
    );

    return {
      domains,
      webhooks: (webhookList.data?.data ?? []).map((hook) => ({
        id: hook.id,
        endpoint: hook.endpoint,
        status: hook.status,
        events: hook.events ?? [],
      })),
      recentEmails: (emailList.data?.data ?? []).map((email) => ({
        lastEvent: email.last_event,
      })),
    };
  },
};

export type MemoryMailer = Mailer & {
  /** Everything delivered so far, oldest first. */
  sent: (OutboundEmail & { id: string })[];
  /** Makes the next `send` throw with this message, then clears itself. */
  failNext(error: string): void;
  reset(): void;
};

/**
 * The test adapter: keeps what it is handed and honours idempotency keys the
 * way Resend does (a repeated key returns the first id and delivers nothing).
 */
export function createMemoryMailer(): MemoryMailer {
  let pendingFailure: string | null = null;
  let counter = 0;

  const mailer: MemoryMailer = {
    sent: [],
    failNext(error) {
      pendingFailure = error;
    },
    // Ids keep counting across resets: `email_activities.provider_email_id`
    // is unique, so a reset must not hand out an id a row already holds.
    reset() {
      mailer.sent.length = 0;
      pendingFailure = null;
    },
    async send(email) {
      if (pendingFailure) {
        const error = pendingFailure;
        pendingFailure = null;
        throw new Error(error);
      }

      const duplicate = email.idempotencyKey
        ? mailer.sent.find((row) => row.idempotencyKey === email.idempotencyKey)
        : undefined;
      if (duplicate) {
        return { id: duplicate.id };
      }

      counter += 1;
      const id = `mem_${counter}`;
      mailer.sent.push({ ...email, id });
      return { id };
    },
    async fetchCopy(providerEmailId) {
      const email = mailer.sent.find((row) => row.id === providerEmailId);
      return email ? { html: null, text: email.text ?? null, subject: email.subject } : null;
    },
    async inspectAccount() {
      return { domains: [], webhooks: [], recentEmails: [] };
    },
  };

  return mailer;
}

let mailerOverride: Mailer | null = null;

/**
 * Swaps the adapter for the rest of the process. Tests install a
 * `createMemoryMailer()` here instead of mocking the module.
 */
export function installMailer(mailer: Mailer | null) {
  mailerOverride = mailer;
}

/** The adapter in force. Throws when Resend is not configured. */
export function getMailer(): Mailer {
  if (mailerOverride) {
    return mailerOverride;
  }
  getResendClient();
  return resendMailer;
}

export function isMailerConfigured() {
  return mailerOverride !== null || Boolean(getServerEnv().RESEND_API_KEY);
}

/**
 * Checks a Resend webhook signature and returns the event. Lives here rather
 * than on the adapter because the route is Resend's by name; a memory mailer
 * has no webhooks.
 */
export function verifyResendWebhook(input: {
  payload: string;
  headers: { id: string; timestamp: string; signature: string };
}) {
  const env = getServerEnv();

  if (!env.RESEND_WEBHOOK_SECRET) {
    throw new Error("RESEND_WEBHOOK_SECRET is required to verify Resend webhook events.");
  }

  return getResendClient().webhooks.verify({
    payload: input.payload,
    headers: input.headers,
    webhookSecret: env.RESEND_WEBHOOK_SECRET,
  });
}

// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------

export type EmailRecipient = {
  email: string;
  name?: string | null;
  /** Ties the `email_activities` row to a person, so their Emails tab shows it. */
  memberId?: string | null;
  /** Why this address is on the list — surfaced in the email activity log. */
  reason?: NotificationRecipient["reason"];
};

export type SendEmailInput = {
  orgId: string;
  kind: EmailKind;
  to: EmailRecipient;
  subject: string;
  react?: ReactElement;
  /** Plain-text body for the few mails with no template (password reset). */
  text?: string;
  eventId?: string | null;
  /** Set for activation invites so the row is offered as resendable. */
  inviteId?: string | null;
  /** The earlier activity this one replaces (a re-sent invite). */
  resendOfActivityId?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string;
};

export type SendEmailResult =
  | { sent: true; providerEmailId: string | null; activityId: string | null }
  | { sent: false; error: string; activityId: string | null };

/**
 * Sends one email and records it — one `email_activities` row whether the
 * provider accepted it or not — and never throws: a broken mailbox must not
 * take down the action that triggered the mail. Callers that need the failure
 * (the activation invite marks its invite failed) read `sent`.
 *
 * A mailer that is not configured at all is the one case that leaves no row:
 * that is a deployment problem, not a delivery problem, and it is reported
 * once on the console instead of once per recipient in the activity log.
 *
 * A retry under an `idempotencyKey` the provider has already seen comes back
 * with the first send's id; that id is unique per row, so the result points
 * at the row already there rather than filing a second one.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  let mailer: Mailer;
  let fromEmail: string;

  try {
    mailer = getMailer();
    fromEmail = getResendFromEmail();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailer unavailable.";
    console.error(`[mailer] ${input.kind}: mailer unavailable — ${message}`);
    return { sent: false, error: message, activityId: null };
  }

  const metadata = input.to.reason
    ? { ...(input.metadata ?? {}), recipientReason: input.to.reason }
    : (input.metadata ?? null);

  const activity = {
    orgId: input.orgId,
    kind: input.kind,
    memberId: input.to.memberId ?? null,
    eventId: input.eventId ?? null,
    inviteId: input.inviteId ?? null,
    resendOfActivityId: input.resendOfActivityId ?? null,
    actorUserId: input.actorUserId ?? null,
    fromEmail,
    toEmail: input.to.email,
    toName: input.to.name ?? null,
    subject: input.subject,
    metadata,
  };

  try {
    const { id } = await mailer.send({
      from: fromEmail,
      to: input.to.email,
      subject: input.subject,
      react: input.react,
      text: input.text,
      idempotencyKey: input.idempotencyKey,
    });

    const existing = id ? await getEmailActivityByProviderEmailId(id) : null;
    if (existing) {
      return { sent: true, providerEmailId: id, activityId: existing.id };
    }

    const activityId = await recordEmailActivity({ ...activity, providerEmailId: id });
    return { sent: true, providerEmailId: id, activityId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send error.";

    // Member id, never the address: this line lands in the host's log store,
    // which is retained under their policy rather than ours and sits outside
    // every retention rule we set. The address is one query away from the id.
    const who = input.to.memberId ?? "unknown recipient";
    console.error(`[mailer] ${input.kind} → member ${who}: ${message}`);

    const activityId = await recordEmailActivity({ ...activity, error: message }).catch(
      () => null,
    );
    return { sent: false, error: message, activityId };
  }
}

/**
 * The batch form for admin notifications: one send and one row per
 * recipient, each carrying why the address was on the list.
 */
export async function sendNotificationEmails(params: {
  orgId: string;
  kind: EmailKind;
  recipients: NotificationRecipient[];
  subject: string;
  react: ReactElement;
  memberId?: string | null;
  eventId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  for (const recipient of params.recipients) {
    await sendEmail({
      orgId: params.orgId,
      kind: params.kind,
      to: {
        ...recipient,
        // Per-recipient id wins: a broadcast has a different member per row.
        memberId: recipient.memberId ?? params.memberId ?? null,
      },
      subject: params.subject,
      react: params.react,
      eventId: params.eventId,
      metadata: params.metadata,
    });
  }
}
