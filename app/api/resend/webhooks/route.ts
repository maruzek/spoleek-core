import { NextResponse } from "next/server";

import { updateEmailActivityStatusByProviderEmailId } from "@/server/lib/email-activity";
import { getResendClient, getResendWebhookSecret } from "@/server/lib/email";
import { updateMemberInviteDeliveryStatus } from "@/server/lib/member-invites";

const deliveryStatusByEvent = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
} as const;

export async function POST(request: Request) {
  const payload = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    return NextResponse.json(
      { error: "Missing webhook signature headers." },
      { status: 400 },
    );
  }

  let event: Awaited<ReturnType<typeof getResendClient>>["webhooks"] extends {
    verify: (input: infer TInput) => infer TOutput;
  }
    ? TOutput
    : never;

  try {
    event = getResendClient().webhooks.verify({
      payload,
      headers: {
        id,
        timestamp,
        signature,
      },
      webhookSecret: getResendWebhookSecret(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to verify webhook payload.",
      },
      { status: 401 },
    );
  }

  const deliveryStatus =
    event.type in deliveryStatusByEvent
      ? deliveryStatusByEvent[event.type as keyof typeof deliveryStatusByEvent]
      : null;

  if (
    !deliveryStatus ||
    !("email_id" in event.data) ||
    typeof event.data.email_id !== "string"
  ) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  await updateMemberInviteDeliveryStatus({
    providerEmailId: event.data.email_id,
    deliveryStatus,
    eventType: event.type,
    metadata: event.data as unknown as Record<string, unknown>,
  });

  const message =
    "bounce" in event.data && event.data.bounce?.message
      ? event.data.bounce.message
      : "suppressed" in event.data && event.data.suppressed?.message
        ? event.data.suppressed.message
        : "failed" in event.data && event.data.failed?.reason
          ? event.data.failed.reason
          : null;

  await updateEmailActivityStatusByProviderEmailId({
    providerEmailId: event.data.email_id,
    status: deliveryStatus,
    providerEventType: event.type,
    message,
    metadata: event.data as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}
