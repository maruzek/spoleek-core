import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { generateMembershipPayments } from "@/server/lib/payment-lifecycle";
import { sendMembershipReportReminders } from "@/server/lib/membership-report-reminders";

function isAuthorized(request: Request) {
  const env = getServerEnv();
  const secret = env.PAYMENTS_CRON_SECRET ?? process.env.CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      message: "PAYMENTS_CRON_SECRET or CRON_SECRET is not configured.",
    };
  }

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-spoleek-cron-secret");
  const providedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : headerSecret;

  if (providedSecret !== secret) {
    return {
      ok: false as const,
      status: 401,
      message: "Unauthorized.",
    };
  }

  return {
    ok: true as const,
  };
}

async function handleGenerate(request: Request) {
  const authorization = isAuthorized(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.message },
      { status: authorization.status },
    );
  }

  const result = await generateMembershipPayments();

  console.info("Generated membership payments", result);

  // Same daily cadence, so it rides this cron rather than adding another entry.
  // Failures are reported alongside the payment run, never thrown — a broken
  // mailer must not stop fees from being generated.
  const reminders = await sendMembershipReportReminders().catch((error) => {
    console.error("Membership report reminders failed", error);
    return null;
  });

  if (reminders) {
    console.info("Sent membership report reminders", reminders);
  }

  return NextResponse.json({ ...result, reminders });
}

export async function GET(request: Request) {
  return handleGenerate(request);
}

export async function POST(request: Request) {
  return handleGenerate(request);
}
