import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";

import { db, pool } from "@/server/db";
import {
  emailActivities,
  emailActivityEvents,
  memberPayments,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import { getDictionary } from "@/lib/i18n";
import { sendPaymentConfirmedEmail } from "@/server/lib/payment-status";
import { createMemoryMailer, sendEmail, installMailer } from "@/server/notifications/send";

/**
 * The mailer door (`sendEmail`) is the only way out for an email, and every
 * send leaves one `email_activities` row. These tests drive a payment mail —
 * one of the paths that used to call Resend directly and so was invisible to
 * the member's Emails tab — through the in-memory adapter and read the row
 * back, then pin the door's failure contract.
 *
 * Needs a database. Creates its own organization and deletes it afterwards.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("email door", () => {
  const mailer = createMemoryMailer();
  // Whatever the deployment locale is, the subject must be the dictionary's.
  const confirmedSubject = getDictionary().emails.paymentConfirmed.subject("2026");
  let orgId: string;
  let memberId: string;
  let paymentId: string;

  async function latestActivity(kind: (typeof emailActivities.$inferSelect)["kind"]) {
    const [row] = await db
      .select()
      .from(emailActivities)
      .where(and(eq(emailActivities.orgId, orgId), eq(emailActivities.kind, kind)))
      .orderBy(desc(emailActivities.createdAt))
      .limit(1);
    return row ?? null;
  }

  beforeAll(async () => {
    installMailer(mailer);

    const suffix = Date.now();
    const [org] = await db
      .insert(organizations)
      .values({ name: "Email Door Test Org", slug: `email-door-${suffix}` })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        firstName: "Petra",
        lastName: "Payer",
        email: `petra-${suffix}@example.test`,
        status: "active",
      })
      .returning({ id: tenantMembers.id });
    memberId = member.id;

    const [payment] = await db
      .insert(memberPayments)
      .values({
        orgId,
        type: "membership_fee",
        memberId,
        amount: 50_000,
        currency: "CZK",
        periodLabel: "2026",
        periodKey: "2026",
        dueAt: new Date(),
      })
      .returning({ id: memberPayments.id });
    paymentId = payment.id;
  });

  beforeEach(() => {
    mailer.reset();
  });

  afterAll(async () => {
    installMailer(null);
    if (orgId) {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
  });

  it("a payment-confirmed mail goes through the adapter and lands in email_activities", async () => {
    await sendPaymentConfirmedEmail(paymentId, new Date("2026-03-01T10:00:00Z"));

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: expect.stringMatching(/^petra-\d+@example\.test$/),
      subject: confirmedSubject,
    });

    const activity = await latestActivity("payment_confirmed");
    expect(activity).toMatchObject({
      memberId,
      toEmail: mailer.sent[0]?.to,
      subject: confirmedSubject,
      currentStatus: "sent",
      providerEmailId: mailer.sent[0]?.id,
      metadata: { paymentId },
    });
  });

  it("respects the organization's payment-confirmed switch", async () => {
    await db
      .update(organizations)
      .set({ emailNotifyPaymentConfirmed: false })
      .where(eq(organizations.id, orgId));

    try {
      await sendPaymentConfirmedEmail(paymentId, new Date());
      expect(mailer.sent).toHaveLength(0);
    } finally {
      await db
        .update(organizations)
        .set({ emailNotifyPaymentConfirmed: true })
        .where(eq(organizations.id, orgId));
    }
  });

  it("a refused send is recorded as failed and reported, not thrown", async () => {
    mailer.failNext("mailbox full");

    const result = await sendEmail({
      orgId,
      kind: "payment_overdue",
      to: { email: "petra@example.test", name: "Petra", memberId },
      subject: "Action required",
      text: "Please pay.",
    });

    expect(result).toMatchObject({ sent: false, error: "mailbox full" });
    expect(mailer.sent).toHaveLength(0);

    const activity = await latestActivity("payment_overdue");
    expect(activity).toMatchObject({
      currentStatus: "failed",
      lastError: "mailbox full",
      providerEmailId: null,
    });
    expect(activity?.id).toBe(result.activityId);

    const events = await db
      .select({ eventType: emailActivityEvents.eventType })
      .from(emailActivityEvents)
      .where(eq(emailActivityEvents.emailActivityId, activity!.id));
    expect(events.map((event) => event.eventType)).toEqual(["failed"]);
  });

  it("a repeated idempotency key delivers nothing new and points at the first row", async () => {
    const send = () =>
      sendEmail({
        orgId,
        kind: "workspace_welcome",
        to: { email: "petra@example.test", memberId },
        subject: "Your account is ready",
        text: "Welcome.",
        idempotencyKey: `welcome/${paymentId}`,
      });

    const first = await send();
    const second = await send();

    expect(mailer.sent).toHaveLength(1);
    expect(first).toMatchObject({ sent: true, providerEmailId: mailer.sent[0]?.id });
    expect(second).toEqual(first);
  });
});
