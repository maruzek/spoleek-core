import { asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  emailActivities,
  emailActivityEvents,
  memberInvites,
  tenantMembers,
} from "@/server/db/schema";
import { getMemberDisplayName } from "@/lib/member-custom-fields";

function getResendAvailability(params: {
  kind: "member_activation_invite" | "workspace_welcome";
  memberId: string | null;
  memberStatus: string | null;
  memberUserId: string | null;
  memberLinkedAt: Date | null;
  inviteId: string | null;
  inviteStatus: string | null;
  inviteDeliveryStatus: string | null;
  inviteResendAvailableAt: Date | null;
}) {
  if (params.kind !== "member_activation_invite" || !params.memberId || !params.inviteId) {
    return {
      canResend: false,
      resendDisabledReason: "This email record is not backed by a resendable invite.",
    };
  }

  if (params.memberUserId && params.memberLinkedAt) {
    return {
      canResend: false,
      resendDisabledReason: "The member account is already linked.",
    };
  }

  if (params.memberStatus !== "invited" && params.memberStatus !== "active") {
    return {
      canResend: false,
      resendDisabledReason: "Only approved members can receive activation emails.",
    };
  }

  if (params.inviteStatus === "completed") {
    return {
      canResend: false,
      resendDisabledReason: "This invite has already been completed.",
    };
  }

  if (
    params.inviteDeliveryStatus === "bounced" ||
    params.inviteDeliveryStatus === "complained" ||
    params.inviteDeliveryStatus === "suppressed"
  ) {
    return {
      canResend: false,
      resendDisabledReason:
        "Email delivery is blocked because the address bounced, complained, or is suppressed.",
    };
  }

  if (params.inviteResendAvailableAt && params.inviteResendAvailableAt > new Date()) {
    return {
      canResend: false,
      resendDisabledReason: `Resend becomes available at ${params.inviteResendAvailableAt.toLocaleString()}.`,
    };
  }

  return {
    canResend: true,
    resendDisabledReason: null,
  };
}

export async function listOrganizationEmailActivities(orgId: string) {
  const rows = await db
    .select({
      id: emailActivities.id,
      direction: emailActivities.direction,
      kind: emailActivities.kind,
      currentStatus: emailActivities.currentStatus,
      memberId: emailActivities.memberId,
      inviteId: emailActivities.inviteId,
      resendOfEmailActivityId: emailActivities.resendOfEmailActivityId,
      providerEmailId: emailActivities.providerEmailId,
      fromEmail: emailActivities.fromEmail,
      toEmail: emailActivities.toEmail,
      toName: emailActivities.toName,
      subject: emailActivities.subject,
      providerEventType: emailActivities.providerEventType,
      lastError: emailActivities.lastError,
      problemAt: emailActivities.problemAt,
      sentAt: emailActivities.sentAt,
      deliveredAt: emailActivities.deliveredAt,
      bouncedAt: emailActivities.bouncedAt,
      complainedAt: emailActivities.complainedAt,
      suppressedAt: emailActivities.suppressedAt,
      failedAt: emailActivities.failedAt,
      lastStatusAt: emailActivities.lastStatusAt,
      createdAt: emailActivities.createdAt,
      memberFirstName: tenantMembers.firstName,
      memberLastName: tenantMembers.lastName,
      memberStatus: tenantMembers.status,
      memberUserId: tenantMembers.userId,
      memberLinkedAt: tenantMembers.linkedAt,
      inviteStatus: memberInvites.status,
      inviteDeliveryStatus: memberInvites.deliveryStatus,
      inviteResendAvailableAt: memberInvites.resendAvailableAt,
    })
    .from(emailActivities)
    .leftJoin(tenantMembers, eq(tenantMembers.id, emailActivities.memberId))
    .leftJoin(memberInvites, eq(memberInvites.id, emailActivities.inviteId))
    .where(eq(emailActivities.orgId, orgId))
    .orderBy(emailActivities.lastStatusAt);

  return rows
    .map((row) => {
      const memberName =
        row.memberId != null
          ? getMemberDisplayName({
              firstName: row.memberFirstName ?? "",
              lastName: row.memberLastName ?? "",
            })
          : null;
      const resendState = getResendAvailability({
        kind: row.kind,
        memberId: row.memberId,
        memberStatus: row.memberStatus,
        memberUserId: row.memberUserId,
        memberLinkedAt: row.memberLinkedAt,
        inviteId: row.inviteId,
        inviteStatus: row.inviteStatus,
        inviteDeliveryStatus: row.inviteDeliveryStatus,
        inviteResendAvailableAt: row.inviteResendAvailableAt,
      });

      return {
        ...row,
        memberName,
        search: [row.toEmail, row.subject, memberName ?? "", row.providerEmailId ?? ""]
          .filter(Boolean)
          .join(" "),
        hasProblem:
          row.currentStatus === "bounced" ||
          row.currentStatus === "complained" ||
          row.currentStatus === "suppressed" ||
          row.currentStatus === "failed",
        ...resendState,
      };
    })
    .sort((a, b) => b.lastStatusAt.getTime() - a.lastStatusAt.getTime());
}

export async function getOrganizationEmailActivityDetail(orgId: string, activityId: string) {
  const [activity] = await db
    .select({
      orgId: emailActivities.orgId,
      id: emailActivities.id,
      direction: emailActivities.direction,
      kind: emailActivities.kind,
      currentStatus: emailActivities.currentStatus,
      memberId: emailActivities.memberId,
      inviteId: emailActivities.inviteId,
      resendOfEmailActivityId: emailActivities.resendOfEmailActivityId,
      actorUserId: emailActivities.actorUserId,
      providerEmailId: emailActivities.providerEmailId,
      fromEmail: emailActivities.fromEmail,
      toEmail: emailActivities.toEmail,
      toName: emailActivities.toName,
      subject: emailActivities.subject,
      providerEventType: emailActivities.providerEventType,
      lastError: emailActivities.lastError,
      problemAt: emailActivities.problemAt,
      sentAt: emailActivities.sentAt,
      deliveredAt: emailActivities.deliveredAt,
      bouncedAt: emailActivities.bouncedAt,
      complainedAt: emailActivities.complainedAt,
      suppressedAt: emailActivities.suppressedAt,
      failedAt: emailActivities.failedAt,
      lastStatusAt: emailActivities.lastStatusAt,
      metadata: emailActivities.metadata,
      createdAt: emailActivities.createdAt,
      memberFirstName: tenantMembers.firstName,
      memberLastName: tenantMembers.lastName,
      memberStatus: tenantMembers.status,
      memberUserId: tenantMembers.userId,
      memberLinkedAt: tenantMembers.linkedAt,
      inviteStatus: memberInvites.status,
      inviteDeliveryStatus: memberInvites.deliveryStatus,
      inviteResendAvailableAt: memberInvites.resendAvailableAt,
      inviteSentAt: memberInvites.sentAt,
      inviteCompletedAt: memberInvites.completedAt,
    })
    .from(emailActivities)
    .leftJoin(tenantMembers, eq(tenantMembers.id, emailActivities.memberId))
    .leftJoin(memberInvites, eq(memberInvites.id, emailActivities.inviteId))
    .where(eq(emailActivities.id, activityId))
    .limit(1);

  if (!activity || (activity.memberId == null && activity.inviteId == null)) {
    if (!activity || activity.orgId !== orgId) {
      return null;
    }
  } else if (activity.orgId !== orgId) {
    return null;
  }

  const events = await db
    .select({
      id: emailActivityEvents.id,
      eventType: emailActivityEvents.eventType,
      providerEventType: emailActivityEvents.providerEventType,
      message: emailActivityEvents.message,
      metadata: emailActivityEvents.metadata,
      occurredAt: emailActivityEvents.occurredAt,
    })
    .from(emailActivityEvents)
    .where(eq(emailActivityEvents.emailActivityId, activityId))
    .orderBy(asc(emailActivityEvents.occurredAt));

  return {
    ...activity,
    memberName:
      activity.memberId != null
        ? getMemberDisplayName({
            firstName: activity.memberFirstName ?? "",
            lastName: activity.memberLastName ?? "",
          })
        : null,
    ...getResendAvailability({
      kind: activity.kind,
      memberId: activity.memberId,
      memberStatus: activity.memberStatus,
      memberUserId: activity.memberUserId,
      memberLinkedAt: activity.memberLinkedAt,
      inviteId: activity.inviteId,
      inviteStatus: activity.inviteStatus,
      inviteDeliveryStatus: activity.inviteDeliveryStatus,
      inviteResendAvailableAt: activity.inviteResendAvailableAt,
    }),
    events,
  };
}
