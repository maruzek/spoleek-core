import { createHash, randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";

import { auth } from "@/lib/auth/auth";
import { getServerEnv } from "@/lib/env";
import { db } from "@/server/db";
import { memberInvites, tenantMembers } from "@/server/db/schema";
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";
import { findUserByEmail } from "@/server/queries/members";

const INVITE_MODE = "member-activation";
const RESET_TOKEN_TTL_SECONDS = 60 * 60;

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getMemberActivationRedirect(memberId: string) {
  const env = getServerEnv();
  const url = new URL("/activate-account", env.APP_URL);
  url.searchParams.set("member", memberId);
  url.searchParams.set("mode", INVITE_MODE);
  return url.toString();
}

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

export async function markMemberInviteSent(params: {
  memberId: string;
  token: string;
}) {
  const member = await getMemberByIdForInvite(params.memberId);

  if (!member) {
    throw new Error("Approved member was not found while sending the invite.");
  }

  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000);
  const currentInvite = await getMemberInviteByMemberId(member.id);
  const now = new Date();

  if (currentInvite) {
    await db
      .update(memberInvites)
      .set({
        status: "sent",
        tokenHash: hashInviteToken(params.token),
        resetTokenExpiresAt: expiresAt,
        sentAt: now,
        lastError: null,
        resendCount: currentInvite.sentAt ? currentInvite.resendCount + 1 : currentInvite.resendCount,
        updatedAt: now,
      })
      .where(eq(memberInvites.id, currentInvite.id));

    return;
  }

  await db.insert(memberInvites).values({
    id: randomUUID(),
    orgId: member.orgId,
    memberId: member.id,
    status: "sent",
    tokenHash: hashInviteToken(params.token),
    resetTokenExpiresAt: expiresAt,
    sentAt: now,
    completedAt: null,
    lastError: null,
    resendCount: 0,
  });
}

export async function markMemberInviteFailed(params: {
  memberId: string;
  error: string;
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
        lastError: params.error,
        updatedAt: now,
      })
      .where(eq(memberInvites.id, currentInvite.id));
    return;
  }

  await db.insert(memberInvites).values({
    id: randomUUID(),
    orgId: member.orgId,
    memberId: member.id,
    status: "failed",
    tokenHash: null,
    resetTokenExpiresAt: null,
    sentAt: null,
    completedAt: null,
    lastError: params.error,
    resendCount: 0,
  });
}

export async function markMemberInviteCompleted(memberId: string) {
  const invite = await getMemberInviteByMemberId(memberId);

  if (!invite) {
    return;
  }

  await db
    .update(memberInvites)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(memberInvites.id, invite.id));
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

export async function sendMemberActivationInvite(params: {
  memberId: string;
  force?: boolean;
}) {
  const member = await getMemberByIdForInvite(params.memberId);

  if (!member) {
    throw new Error("The selected member could not be found.");
  }

  if (member.status !== "active") {
    throw new Error("Only active approved members can receive activation emails.");
  }

  if (!member.email) {
    throw new Error("Add an email address before sending an activation invite.");
  }

  const currentInvite = await getMemberInviteByMemberId(member.id);

  if (
    !params.force &&
    currentInvite?.status === "sent" &&
    currentInvite.resetTokenExpiresAt &&
    currentInvite.resetTokenExpiresAt > new Date()
  ) {
    return {
      sent: false,
      reason: "already-sent" as const,
    };
  }

  const user = await ensureMemberInviteUser({
    email: member.email,
    firstName: member.firstName,
    lastName: member.lastName,
  });

  await db
    .update(tenantMembers)
    .set({
      userId: user.id,
      updatedAt: new Date(),
    })
    .where(eq(tenantMembers.id, member.id));

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: member.email,
        redirectTo: getMemberActivationRedirect(member.id),
      },
      headers: await headers(),
    });

    return {
      sent: true,
      reason: "sent" as const,
    };
  } catch (error) {
    await markMemberInviteFailed({
      memberId: member.id,
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
    })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, organization.id), eq(tenantMembers.id, memberId)))
    .limit(1);

  return member ?? null;
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
    })
    .from(tenantMembers)
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
