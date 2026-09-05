/**
 * Sends every payment-related email to a real inbox, using real rows from the
 * database so the QR code, IBAN and variable symbol are the ones a member would
 * actually receive.
 *
 * The lifecycle only mails on specific calendar days (heads-up: exactly N days
 * before renewal; overdue: the day a payment tips over), so this is the only
 * practical way to review all five templates in one sitting.
 *
 * Usage:
 *   pnpm tsx scripts/send-payment-emails-test.ts --to=you@example.com
 *   pnpm tsx scripts/send-payment-emails-test.ts --to=you@example.com --only=overdue,confirmed
 *   pnpm tsx scripts/send-payment-emails-test.ts --to=you@example.com --dry
 *
 * Templates: headsup, overdue, confirmed, activation, workspace-welcome
 *
 * Note: the QR image in an email is fetched by the mail client from APP_URL, so
 * it only renders when APP_URL is publicly reachable (a tunnel, or staging).
 * On localhost the block still shows the IBAN and VS, just a broken image.
 */
import type { ReactElement } from "react";

import { and, desc, eq } from "drizzle-orm";

import { MemberActivationEmail } from "@/emails/member-activation-email";
import { PaymentConfirmedEmail } from "@/emails/payment-confirmed-email";
import { PaymentOverdueEmail } from "@/emails/payment-overdue-email";
import { PaymentRenewalHeadsupEmail } from "@/emails/payment-renewal-headsup-email";
import { WorkspaceWelcomeEmail } from "@/emails/workspace-welcome-email";
import { getServerEnv } from "@/lib/env";
import { feeAmountToDecimal } from "@/lib/payments";
import { db } from "@/server/db";
import { memberPayments, organizations, tenantMembers } from "@/server/db/schema";
import { getApprovalPaymentDetails } from "@/server/lib/approval-payment-details";
import { getResendClient, getResendFromEmail } from "@/server/lib/email";

const ALL = ["headsup", "overdue", "confirmed", "activation", "workspace-welcome"] as const;
type Template = (typeof ALL)[number];

const args = process.argv.slice(2);
const to = args.find((a) => a.startsWith("--to="))?.slice("--to=".length).trim();
const dry = args.includes("--dry");
const onlyArg = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const only = onlyArg
  ? (onlyArg.split(",").map((s) => s.trim()) as Template[])
  : [...ALL];

const gb = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

async function main() {
  if (!to) {
    throw new Error("Pass --to=you@example.com");
  }

  const unknown = only.filter((t) => !ALL.includes(t));
  if (unknown.length > 0) {
    throw new Error(`Unknown template(s): ${unknown.join(", ")}. Known: ${ALL.join(", ")}`);
  }

  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("No organization found.");

  // Prefer a real pending/overdue row so the QR token points at live data.
  const [row] = await db
    .select({
      payment: memberPayments,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      memberId: tenantMembers.id,
    })
    .from(memberPayments)
    .innerJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
    .where(and(eq(memberPayments.orgId, org.id), eq(memberPayments.type, "membership_fee")))
    .orderBy(desc(memberPayments.createdAt))
    .limit(1);

  if (!row) {
    throw new Error(
      "No membership payment rows exist. Run scripts/seed-payments-test.ts first.",
    );
  }

  const payment = row.payment;
  const memberName = [row.firstName, row.lastName].filter(Boolean).join(" ") || to;
  const amount = feeAmountToDecimal(payment.amount);
  const paymentBlock = await getApprovalPaymentDetails(org.id, row.memberId);

  const resend = getResendClient();
  const from = getResendFromEmail();
  const { APP_URL } = getServerEnv();

  const jobs: Array<{ name: Template; subject: string; react: ReactElement }> = [];

  if (only.includes("headsup")) {
    jobs.push({
      name: "headsup",
      subject: `Membership renewal coming up — ${payment.periodLabel}`,
      react: PaymentRenewalHeadsupEmail({
        organizationName: org.name,
        memberName,
        periodLabel: payment.periodLabel,
        renewalDate: gb(
          new Date(
            new Date().getFullYear(),
            (org.membershipRenewalMonth ?? 1) - 1,
            org.membershipRenewalDay ?? 1,
          ),
        ),
        amount,
        currency: payment.currency,
        bankAccount: org.membershipFeeBankAccount,
      }),
    });
  }

  if (only.includes("overdue")) {
    jobs.push({
      name: "overdue",
      subject: `Action required: membership fee overdue — ${payment.periodLabel}`,
      react: PaymentOverdueEmail({
        organizationName: org.name,
        memberName,
        periodLabel: payment.periodLabel,
        amount,
        currency: payment.currency,
        dueAt: gb(payment.dueAt),
        bankAccount: payment.bankAccount,
        variableSymbol: payment.variableSymbol,
      }),
    });
  }

  if (only.includes("confirmed")) {
    jobs.push({
      name: "confirmed",
      subject: `Payment confirmed — ${payment.periodLabel}`,
      react: PaymentConfirmedEmail({
        organizationName: org.name,
        memberName,
        periodLabel: payment.periodLabel,
        amount,
        currency: payment.currency,
        paidAt: gb(new Date()),
      }),
    });
  }

  if (only.includes("activation")) {
    jobs.push({
      name: "activation",
      subject: "Your membership has been approved",
      react: MemberActivationEmail({
        organizationName: org.name,
        subject: "Your membership has been approved",
        body: "Your membership request has been approved. Use the button below to create your password and complete the remaining profile fields before signing in to the app.",
        activationUrl: `${APP_URL.replace(/\/$/, "")}/auth/activate-account?preview=1`,
        memberName,
        payment: paymentBlock,
      }),
    });
  }

  if (only.includes("workspace-welcome")) {
    jobs.push({
      name: "workspace-welcome",
      subject: `Your ${org.name} Google Workspace account is ready`,
      react: WorkspaceWelcomeEmail({
        organizationName: org.name,
        memberName,
        workspaceEmail: `preview.member@${org.workspaceDomain ?? "example.com"}`,
        temporaryPassword: "Preview-Only-Xy7Qa4",
        signInUrl: `${APP_URL.replace(/\/$/, "")}/auth`,
        payment: paymentBlock,
      }),
    });
  }

  console.log(
    `Sending ${jobs.length} email(s) to ${to} from ${from}\n` +
      `  org=${org.name} payment VS=${payment.variableSymbol} period=${payment.periodLabel}\n` +
      `  QR base=${APP_URL}${APP_URL.includes("localhost") ? "  (QR images will not load in a mail client)" : ""}\n`,
  );

  for (const job of jobs) {
    if (dry) {
      console.log(`  · ${job.name}: would send "[TEST ${job.name}] ${job.subject}"`);
      continue;
    }

    const result = await resend.emails.send({
      from,
      to: [to],
      subject: `[TEST ${job.name}] ${job.subject}`,
      react: job.react,
    });
    console.log(
      result.error
        ? `  ✗ ${job.name}: ${result.error.message}`
        : `  ✓ ${job.name}: ${result.data?.id}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
