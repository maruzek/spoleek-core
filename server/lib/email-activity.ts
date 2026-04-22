import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  emailActivities,
  emailActivityEvents,
  type EmailActivityEventType,
  type EmailActivityStatus,
} from "@/server/db/schema";
import { getMemberInviteByMemberId } from "@/server/lib/member-invites";
import { getAppOrganization } from "@/server/queries/app";

type InviteEmailActivityPayload = {
  memberId: string;
  actorUserId?: string | null;
  providerEmailId?: string | null;
  fromEmail: string;
  toEmail: string;
  toName?: string | null;
  subject: string;
  metadata?: Record<string, unknown> | null;
};

async function createEmailActivityEvent(params: {
  orgId: string;
  emailActivityId: string;
  actorUserId?: string | null;
  eventType: EmailActivityEventType;
  providerEventType?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
}) {
  await db.insert(emailActivityEvents).values({

    orgId: params.orgId,
    emailActivityId: params.emailActivityId,
    actorUserId: params.actorUserId ?? null,
    eventType: params.eventType,
    providerEventType: params.providerEventType ?? null,
    message: params.message ?? null,
    metadata: params.metadata ?? null,
    occurredAt: params.occurredAt ?? new Date(),
  });
}

export async function getEmailActivityByProviderEmailId(providerEmailId: string) {
  const [activity] = await db
    .select()
    .from(emailActivities)
    .where(eq(emailActivities.providerEmailId, providerEmailId))
    .limit(1);

  return activity ?? null;
}

export async function getLatestInviteEmailActivity(memberId: string) {
  const [activity] = await db
    .select()
    .from(emailActivities)
    .where(
      and(
        eq(emailActivities.kind, "member_activation_invite"),
        eq(emailActivities.memberId, memberId),
      ),
    )
    .orderBy(desc(emailActivities.createdAt))
    .limit(1);

  return activity ?? null;
}

export async function recordMemberInviteEmailSent(
  params: InviteEmailActivityPayload,
) {
  const organization = await getAppOrganization();
  const invite = await getMemberInviteByMemberId(params.memberId);

  if (!organization || !invite) {
    return null;
  }

  const previousActivity = await getLatestInviteEmailActivity(params.memberId);
  const now = new Date();
  const [activity] = await db
    .insert(emailActivities)
    .values({
  
      orgId: organization.id,
      direction: "outbound",
      kind: "member_activation_invite",
      currentStatus: "sent",
      memberId: params.memberId,
      inviteId: invite.id,
      resendOfEmailActivityId: previousActivity?.id ?? null,
      actorUserId: params.actorUserId ?? null,
      providerEmailId: params.providerEmailId ?? null,
      fromEmail: params.fromEmail,
      toEmail: params.toEmail,
      toName: params.toName ?? null,
      subject: params.subject,
      providerEventType: "api.accepted",
      sentAt: now,
      lastStatusAt: now,
      metadata: params.metadata ?? null,
    })
    .returning({ id: emailActivities.id, orgId: emailActivities.orgId });

  if (!activity) {
    return null;
  }

  if (previousActivity) {
    await createEmailActivityEvent({
      orgId: activity.orgId,
      emailActivityId: activity.id,
      actorUserId: params.actorUserId,
      eventType: "resend_requested",
      message: "A replacement invite email was requested.",
      metadata: {
        resendOfEmailActivityId: previousActivity.id,
      },
      occurredAt: now,
    });
  }

  await createEmailActivityEvent({
    orgId: activity.orgId,
    emailActivityId: activity.id,
    actorUserId: params.actorUserId,
    eventType: "api_accepted",
    providerEventType: "api.accepted",
    message: "The invite email was accepted for delivery by Resend.",
    metadata: params.metadata ?? null,
    occurredAt: now,
  });

  return activity.id;
}

export async function recordMemberInviteEmailFailed(
  params: InviteEmailActivityPayload & { error: string },
) {
  const organization = await getAppOrganization();
  const invite = await getMemberInviteByMemberId(params.memberId);

  if (!organization) {
    return null;
  }

  const previousActivity = await getLatestInviteEmailActivity(params.memberId);
  const now = new Date();
  const [activity] = await db
    .insert(emailActivities)
    .values({
  
      orgId: organization.id,
      direction: "outbound",
      kind: "member_activation_invite",
      currentStatus: "failed",
      memberId: params.memberId,
      inviteId: invite?.id ?? null,
      resendOfEmailActivityId: previousActivity?.id ?? null,
      actorUserId: params.actorUserId ?? null,
      providerEmailId: params.providerEmailId ?? null,
      fromEmail: params.fromEmail,
      toEmail: params.toEmail,
      toName: params.toName ?? null,
      subject: params.subject,
      providerEventType: "api.failed",
      lastError: params.error,
      problemAt: now,
      failedAt: now,
      lastStatusAt: now,
      metadata: params.metadata ?? null,
    })
    .returning({ id: emailActivities.id, orgId: emailActivities.orgId });

  if (!activity) {
    return null;
  }

  if (previousActivity) {
    await createEmailActivityEvent({
      orgId: activity.orgId,
      emailActivityId: activity.id,
      actorUserId: params.actorUserId,
      eventType: "resend_requested",
      message: "A replacement invite email was requested.",
      metadata: {
        resendOfEmailActivityId: previousActivity.id,
      },
      occurredAt: now,
    });
  }

  await createEmailActivityEvent({
    orgId: activity.orgId,
    emailActivityId: activity.id,
    actorUserId: params.actorUserId,
    eventType: "failed",
    providerEventType: "api.failed",
    message: params.error,
    metadata: params.metadata ?? null,
    occurredAt: now,
  });

  return activity.id;
}

export async function updateEmailActivityStatusByProviderEmailId(params: {
  providerEmailId: string;
  status: EmailActivityStatus;
  providerEventType: string;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const activity = await getEmailActivityByProviderEmailId(params.providerEmailId);

  if (!activity) {
    return null;
  }

  const now = new Date();
  const patch: Partial<typeof emailActivities.$inferInsert> = {
    currentStatus: params.status,
    providerEventType: params.providerEventType,
    lastStatusAt: now,
    updatedAt: now,
  };

  if (params.status === "sent" && !activity.sentAt) {
    patch.sentAt = now;
  }

  if (params.status === "delivered") {
    patch.deliveredAt = now;
    patch.lastError = null;
  }

  if (params.status === "bounced") {
    patch.bouncedAt = now;
    patch.problemAt = now;
    patch.lastError = params.message ?? params.providerEventType;
  }

  if (params.status === "complained") {
    patch.complainedAt = now;
    patch.problemAt = now;
    patch.lastError = params.message ?? params.providerEventType;
  }

  if (params.status === "suppressed") {
    patch.suppressedAt = now;
    patch.problemAt = now;
    patch.lastError = params.message ?? params.providerEventType;
  }

  if (params.status === "failed") {
    patch.failedAt = now;
    patch.problemAt = now;
    patch.lastError = params.message ?? params.providerEventType;
  }

  await db
    .update(emailActivities)
    .set(patch)
    .where(eq(emailActivities.id, activity.id));

  const eventTypeMap: Record<EmailActivityStatus, EmailActivityEventType> = {
    sent: "sent",
    delivered: "delivered",
    bounced: "bounced",
    complained: "complained",
    suppressed: "suppressed",
    failed: "failed",
  };

  await createEmailActivityEvent({
    orgId: activity.orgId,
    emailActivityId: activity.id,
    actorUserId: activity.actorUserId,
    eventType: eventTypeMap[params.status],
    providerEventType: params.providerEventType,
    message: params.message ?? null,
    metadata: params.metadata ?? null,
    occurredAt: now,
  });

  return activity.id;
}
