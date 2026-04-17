import { createHash, randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";

import { auth } from "@/lib/auth/auth";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { db } from "@/server/db";
import {
  memberAuthEvents,
  memberInvites,
  tenantMembers,
  type MemberInviteDeliveryStatus,
} from "@/server/db/schema";
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";
import { findUserByEmail } from "@/server/queries/members";

const INVITE_MODE = "member-activation";
const RESET_TOKEN_TTL_SECONDS = 60 * 60;
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_ACTIVATION_ATTEMPTS = 5;
const ACTIVATION_BLOCK_MS = 15 * 60 * 1000;

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function buildPortalUrl(path: string) {
  return buildAbsoluteAppUrl(path);
}

function getMemberActivationRedirect(memberId: string) {
  const url = new URL(buildAbsoluteAppUrl("/activate-account"));
  url.searchParams.set("member", memberId);
  url.searchParams.set("mode", INVITE_MODE);
  return url.toString();
}

type MemberInviteSendReason =
  | "sent"
  | "already-sent"
  | "already-completed"
  | "already-active"
  | "cooldown"
  | "suppressed";

type InviteMemberRecord = {
  id: string;
  orgId: string;
  userId: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  status: "invited" | "pending" | "active" | "archived" | "deleted";
  linkedAt: Date | null;
};

export async function ensureMemberInviteUser(params: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const context = await auth.$context;
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    return existingUser;
  }

  const createdUser = await context.internalAdapter.createUser({
    id: context.generateId({ model: "user" }) || randomUUID(),
    email: normalizedEmail,
    emailVerified: true,
    name: `${params.firstName} ${params.lastName}`.trim(),
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (!createdUser) {
    throw new Error("Unable to create the Better Auth user for this member.");
  }

  return createdUser;
}

export async function getMemberInviteByMemberId(memberId: string) {
  const [invite] = await db
    .select()
    .from(memberInvites)
    .where(eq(memberInvites.memberId, memberId))
    .limit(1);

  return invite ?? null;
}

export async function getMemberInviteByProviderEmailId(providerEmailId: string) {
  const [invite] = await db
    .select()
    .from(memberInvites)
    .where(eq(memberInvites.providerEmailId, providerEmailId))
    .limit(1);

  return invite ?? null;
}

export async function getValidMemberInvite(params: {
  memberId: string;
  token: string;
}) {
  const invite = await getMemberInviteByMemberId(params.memberId);

  if (!invite || invite.status !== "sent" || !invite.tokenHash || !invite.resetTokenExpiresAt) {
    return null;
  }

  if (invite.tokenHash !== hashInviteToken(params.token)) {
    return null;
  }

  if (invite.resetTokenExpiresAt < new Date()) {
    return null;
  }

  return invite;
}

export async function logMemberAuthEvent(params: {
  orgId: string;
  memberId: string;
  eventType:
    | "member_approved"
    | "invite_send_requested"
    | "invite_sent"
    | "invite_send_skipped"
    | "invite_delivery_updated"
    | "invite_completed"
    | "activation_attempt_blocked"
    | "password_reset_sent";
  actorUserId?: string | null;
  inviteId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await db.insert(memberAuthEvents).values({
    id: randomUUID(),
    orgId: params.orgId,
    memberId: params.memberId,
    actorUserId: params.actorUserId ?? null,
    inviteId: params.inviteId ?? null,
    eventType: params.eventType,
    message: params.message ?? null,
    metadata: params.metadata ?? null,
  });
}

export async function markMemberInviteSent(params: {
  memberId: string;
  token: string;
  providerEmailId?: string | null;
  actorUserId?: string | null;
}) {
  const member = await getMemberByIdForInvite(params.memberId);

  if (!member) {
    throw new Error("Approved member was not found while sending the invite.");
  }

  const currentInvite = await getMemberInviteByMemberId(member.id);
  const now = new Date();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000);
  const resendAvailableAt = new Date(Date.now() + RESEND_COOLDOWN_MS);

  if (currentInvite) {
    await db
      .update(memberInvites)
      .set({
        status: "sent",
        deliveryStatus: "sent",
        tokenHash: hashInviteToken(params.token),
        providerEmailId: params.providerEmailId ?? currentInvite.providerEmailId,
        resetTokenExpiresAt: expiresAt,
        resendAvailableAt,
        sentAt: now,
        lastError: null,
        lastDeliveryEvent: "email.sent",
        deliveryUpdatedAt: now,
        resendCount: currentInvite.sentAt ? currentInvite.resendCount + 1 : currentInvite.resendCount,
        updatedAt: now,
      })
      .where(eq(memberInvites.id, currentInvite.id));

    await logMemberAuthEvent({
      orgId: member.orgId,
      memberId: member.id,
      actorUserId: params.actorUserId,
      inviteId: currentInvite.id,
      eventType: "invite_sent",
      metadata: {
        providerEmailId: params.providerEmailId ?? currentInvite.providerEmailId,
      },
    });
    return;
  }

  const [createdInvite] = await db
    .insert(memberInvites)
    .values({
      id: randomUUID(),
      orgId: member.orgId,
      memberId: member.id,
      provisionedUserId: null,
      claimedUserId: null,
      status: "sent",
      deliveryStatus: "sent",
      tokenHash: hashInviteToken(params.token),
      providerEmailId: params.providerEmailId ?? null,
      resetTokenExpiresAt: expiresAt,
      resendAvailableAt,
      deliveryUpdatedAt: now,
      lastDeliveryEvent: "email.sent",
      sentAt: now,
      completedAt: null,
      lastError: null,
      resendCount: 0,
    })
    .returning({ id: memberInvites.id });

  await logMemberAuthEvent({
    orgId: member.orgId,
    memberId: member.id,
    actorUserId: params.actorUserId,
    inviteId: createdInvite?.id ?? null,
    eventType: "invite_sent",
    metadata: {
      providerEmailId: params.providerEmailId ?? null,
    },
  });
}

export async function markMemberInviteFailed(params: {
  memberId: string;
  error: string;
  actorUserId?: string | null;
}) {
  const member = await getMemberByIdForInvite(params.memberId);

  if (!member) {
    return;
  }

  const currentInvite = await getMemberInviteByMemberId(member.id);
  const now = new Date();

  if (currentInvite) {
    await db
      .update(memberInvites)
      .set({
        status: "failed",
        deliveryStatus: "failed",
        lastError: params.error,
        lastDeliveryEvent: "email.failed",
        deliveryUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(memberInvites.id, currentInvite.id));

    await logMemberAuthEvent({
      orgId: member.orgId,
      memberId: member.id,
      actorUserId: params.actorUserId,
      inviteId: currentInvite.id,
      eventType: "invite_send_skipped",
      message: params.error,
    });
    return;
  }

  const [createdInvite] = await db
    .insert(memberInvites)
    .values({
      id: randomUUID(),
      orgId: member.orgId,
      memberId: member.id,
      provisionedUserId: null,
      claimedUserId: null,
      status: "failed",
      deliveryStatus: "failed",
      tokenHash: null,
      providerEmailId: null,
      resetTokenExpiresAt: null,
      resendAvailableAt: null,
      deliveryUpdatedAt: now,
      lastDeliveryEvent: "email.failed",
      sentAt: null,
      completedAt: null,
      lastError: params.error,
      resendCount: 0,
    })
    .returning({ id: memberInvites.id });

  await logMemberAuthEvent({
    orgId: member.orgId,
    memberId: member.id,
    actorUserId: params.actorUserId,
    inviteId: createdInvite?.id ?? null,
    eventType: "invite_send_skipped",
    message: params.error,
  });
}

export async function markMemberInviteCompleted(params: {
  memberId: string;
  claimedUserId: string;
}) {
  const invite = await getMemberInviteByMemberId(params.memberId);

  if (!invite) {
    return;
  }

  await db
    .update(memberInvites)
    .set({
      status: "completed",
      claimedUserId: params.claimedUserId,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(memberInvites.id, invite.id));

  await logMemberAuthEvent({
    orgId: invite.orgId,
    memberId: invite.memberId,
    inviteId: invite.id,
    actorUserId: params.claimedUserId,
    eventType: "invite_completed",
  });
}

export async function markMemberInviteExpiredIfNeeded(memberId: string) {
  const invite = await getMemberInviteByMemberId(memberId);

  if (
    invite &&
    invite.status === "sent" &&
    invite.resetTokenExpiresAt &&
    invite.resetTokenExpiresAt < new Date()
  ) {
    await db
      .update(memberInvites)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(eq(memberInvites.id, invite.id));
  }
}

export async function registerActivationAttempt(memberId: string) {
  const invite = await getMemberInviteByMemberId(memberId);

  if (!invite) {
    return { blocked: false as const, invite: null };
  }

  const now = new Date();

  if (invite.activationBlockedUntil && invite.activationBlockedUntil > now) {
    await logMemberAuthEvent({
      orgId: invite.orgId,
      memberId: invite.memberId,
      inviteId: invite.id,
      actorUserId: invite.provisionedUserId,
      eventType: "activation_attempt_blocked",
      message: "Activation attempt blocked by cooldown.",
    });
    return { blocked: true as const, invite };
  }

  const nextCount =
    invite.lastActivationAttemptAt &&
    now.getTime() - invite.lastActivationAttemptAt.getTime() <= ACTIVATION_BLOCK_MS
      ? invite.activationAttemptCount + 1
      : 1;

  const activationBlockedUntil =
    nextCount >= MAX_ACTIVATION_ATTEMPTS ? new Date(now.getTime() + ACTIVATION_BLOCK_MS) : null;

  await db
    .update(memberInvites)
    .set({
      activationAttemptCount: nextCount,
      lastActivationAttemptAt: now,
      activationBlockedUntil,
      updatedAt: now,
    })
    .where(eq(memberInvites.id, invite.id));

  if (activationBlockedUntil) {
    await logMemberAuthEvent({
      orgId: invite.orgId,
      memberId: invite.memberId,
      inviteId: invite.id,
      actorUserId: invite.provisionedUserId,
      eventType: "activation_attempt_blocked",
      message: "Too many activation attempts.",
      metadata: { activationBlockedUntil: activationBlockedUntil.toISOString() },
    });
  }

  return { blocked: Boolean(activationBlockedUntil), invite };
}

export async function updateMemberInviteDeliveryStatus(params: {
  providerEmailId: string;
  deliveryStatus: MemberInviteDeliveryStatus;
  eventType: string;
  metadata?: Record<string, unknown> | null;
}) {
  const invite = await getMemberInviteByProviderEmailId(params.providerEmailId);

  if (!invite) {
    return null;
  }

  const now = new Date();
  await db
    .update(memberInvites)
    .set({
      deliveryStatus: params.deliveryStatus,
      lastDeliveryEvent: params.eventType,
      deliveryUpdatedAt: now,
      updatedAt: now,
      lastError:
        params.deliveryStatus === "bounced" ||
        params.deliveryStatus === "complained" ||
        params.deliveryStatus === "suppressed"
          ? params.eventType
          : invite.lastError,
    })
    .where(eq(memberInvites.id, invite.id));

  await logMemberAuthEvent({
    orgId: invite.orgId,
    memberId: invite.memberId,
    inviteId: invite.id,
    actorUserId: invite.provisionedUserId,
    eventType: "invite_delivery_updated",
    message: params.eventType,
    metadata: params.metadata ?? null,
  });

  return invite;
}

export async function sendMemberActivationInvite(params: {
  memberId: string;
  force?: boolean;
  actorUserId?: string | null;
}) {
  const member = await getMemberByIdForInvite(params.memberId);

  if (!member) {
    throw new Error("The selected member could not be found.");
  }

  if (!["invited", "active"].includes(member.status)) {
    throw new Error("Only approved members can receive activation emails.");
  }

  if (!member.email) {
    throw new Error("Add an email address before sending an activation invite.");
  }

  const currentInvite = await getMemberInviteByMemberId(member.id);
  const now = new Date();

  await logMemberAuthEvent({
    orgId: member.orgId,
    memberId: member.id,
    actorUserId: params.actorUserId,
    inviteId: currentInvite?.id ?? null,
    eventType: "invite_send_requested",
    metadata: {
      force: Boolean(params.force),
    },
  });

  if (member.userId && member.linkedAt) {
    await logMemberAuthEvent({
      orgId: member.orgId,
      memberId: member.id,
      actorUserId: params.actorUserId,
      inviteId: currentInvite?.id ?? null,
      eventType: "invite_send_skipped",
      message: "Invite skipped because the member is already linked.",
    });
    return {
      sent: false as const,
      reason: "already-active" as MemberInviteSendReason,
    };
  }

  if (currentInvite?.status === "completed") {
    await logMemberAuthEvent({
      orgId: member.orgId,
      memberId: member.id,
      actorUserId: params.actorUserId,
      inviteId: currentInvite.id,
      eventType: "invite_send_skipped",
      message: "Invite skipped because activation is already completed.",
    });
    return {
      sent: false as const,
      reason: "already-completed" as MemberInviteSendReason,
    };
  }

  if (
    currentInvite &&
    ["bounced", "complained", "suppressed"].includes(currentInvite.deliveryStatus)
  ) {
    await logMemberAuthEvent({
      orgId: member.orgId,
      memberId: member.id,
      actorUserId: params.actorUserId,
      inviteId: currentInvite.id,
      eventType: "invite_send_skipped",
      message: `Invite skipped because the email is ${currentInvite.deliveryStatus}.`,
    });
    return {
      sent: false as const,
      reason: "suppressed" as MemberInviteSendReason,
    };
  }

  if (
    !params.force &&
    currentInvite?.status === "sent" &&
    currentInvite.resetTokenExpiresAt &&
    currentInvite.resetTokenExpiresAt > now
  ) {
    return {
      sent: false as const,
      reason: "already-sent" as MemberInviteSendReason,
    };
  }

  if (currentInvite?.resendAvailableAt && currentInvite.resendAvailableAt > now) {
    await logMemberAuthEvent({
      orgId: member.orgId,
      memberId: member.id,
      actorUserId: params.actorUserId,
      inviteId: currentInvite.id,
      eventType: "invite_send_skipped",
      message: "Invite skipped because resend cooldown is active.",
      metadata: {
        resendAvailableAt: currentInvite.resendAvailableAt.toISOString(),
      },
    });
    return {
      sent: false as const,
      reason: "cooldown" as MemberInviteSendReason,
    };
  }

  const user = await ensureMemberInviteUser({
    email: member.email,
    firstName: member.firstName,
    lastName: member.lastName,
  });

  await upsertProvisionedUser(member, user.id);

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: member.email,
        redirectTo: getMemberActivationRedirect(member.id),
      },
      headers: await headers(),
    });

    return {
      sent: true as const,
      reason: "sent" as MemberInviteSendReason,
    };
  } catch (error) {
    await markMemberInviteFailed({
      memberId: member.id,
      actorUserId: params.actorUserId,
      error: error instanceof Error ? error.message : "Failed to send invite email.",
    });
    throw error;
  }
}

export function isMemberActivationResetUrl(url: string) {
  const parsedUrl = new URL(url);
  const callbackUrl = parsedUrl.searchParams.get("callbackURL");

  if (!callbackUrl) {
    return null;
  }

  const decoded = new URL(decodeURIComponent(callbackUrl));

  if (decoded.searchParams.get("mode") !== INVITE_MODE) {
    return null;
  }

  const memberId = decoded.searchParams.get("member");

  if (!memberId) {
    return null;
  }

  return {
    memberId,
    callbackUrl: decoded.toString(),
  };
}

export async function getMemberInviteEmailContent(memberId: string) {
  const member = await getMemberByIdForInvite(memberId);

  if (!member) {
    throw new Error("Member was not found while preparing the invite email.");
  }

  const policy = await getOrganizationPolicy(member.orgId);
  const organization = await getAppOrganization();

  if (!organization || !policy) {
    throw new Error("Organization settings are incomplete for member invite emails.");
  }

  return {
    organizationName: organization.name,
    subject: policy.memberInviteEmailSubject,
    body: policy.memberInviteEmailBody,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    email: member.email,
  };
}

export async function getInviteMemberForActivation(memberId: string) {
  const organization = await getAppOrganization();

  if (!organization) {
    return null;
  }

  const [row] = await db
    .select({
      id: tenantMembers.id,
      orgId: tenantMembers.orgId,
      userId: tenantMembers.userId,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      email: tenantMembers.email,
      status: tenantMembers.status,
      linkedAt: tenantMembers.linkedAt,
      inviteStatus: memberInvites.status,
      inviteDeliveryStatus: memberInvites.deliveryStatus,
      inviteCompletedAt: memberInvites.completedAt,
      inviteExpiresAt: memberInvites.resetTokenExpiresAt,
      activationBlockedUntil: memberInvites.activationBlockedUntil,
    })
    .from(tenantMembers)
    .leftJoin(memberInvites, eq(memberInvites.memberId, tenantMembers.id))
    .where(and(eq(tenantMembers.orgId, organization.id), eq(tenantMembers.id, memberId)))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...row,
    organizationName: organization.name,
  };
}

async function upsertProvisionedUser(member: InviteMemberRecord, provisionedUserId: string) {
  const currentInvite = await getMemberInviteByMemberId(member.id);

  if (currentInvite) {
    await db
      .update(memberInvites)
      .set({
        provisionedUserId,
        updatedAt: new Date(),
      })
      .where(eq(memberInvites.id, currentInvite.id));
    return currentInvite.id;
  }

  const [createdInvite] = await db
    .insert(memberInvites)
    .values({
      id: randomUUID(),
      orgId: member.orgId,
      memberId: member.id,
      provisionedUserId,
      claimedUserId: null,
      status: "pending",
      deliveryStatus: "pending",
      tokenHash: null,
      providerEmailId: null,
      resetTokenExpiresAt: null,
      resendAvailableAt: null,
      deliveryUpdatedAt: null,
      lastDeliveryEvent: null,
      activationAttemptCount: 0,
      lastActivationAttemptAt: null,
      activationBlockedUntil: null,
      sentAt: null,
      completedAt: null,
      lastError: null,
      resendCount: 0,
    })
    .returning({ id: memberInvites.id });

  return createdInvite?.id ?? null;
}

async function getMemberByIdForInvite(memberId: string) {
  const organization = await getAppOrganization();

  if (!organization) {
    return null;
  }

  const [member] = await db
    .select({
      id: tenantMembers.id,
      orgId: tenantMembers.orgId,
      userId: tenantMembers.userId,
      email: tenantMembers.email,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      status: tenantMembers.status,
      linkedAt: tenantMembers.linkedAt,
    })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, organization.id), eq(tenantMembers.id, memberId)))
    .limit(1);

  return (member ?? null) as InviteMemberRecord | null;
}
