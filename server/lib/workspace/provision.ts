import { eq } from "drizzle-orm";

import { WorkspaceWelcomeEmail } from "@/emails/workspace-welcome-email";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { generateRandomPassword } from "@/lib/crypto";
import { db } from "@/server/db";
import { organizations, tenantMembers } from "@/server/db/schema";
import { getResendClient, getResendFromEmail } from "@/server/lib/email";
import { logMemberAuthEvent } from "@/server/lib/member-invites";
import {
  WorkspaceApiError,
  WorkspaceNotConnectedError,
  createWorkspaceUser,
} from "@/server/lib/workspace/client";

export type ProvisionWorkspaceAccountInput = {
  orgId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  primaryEmail: string;
  toEmail: string;
  actorUserId: string | null;
};

export type ProvisionWorkspaceAccountResult =
  | { success: true; workspaceUserId: string; primaryEmail: string }
  | { success: false; error: string; reason?: string };

function classifyError(error: unknown): { message: string; reason?: string } {
  if (error instanceof WorkspaceApiError) {
    if (error.status === 409 || error.reason === "duplicate") {
      return {
        message: "A Workspace account with this email already exists.",
        reason: "email_taken",
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        message:
          "Google rejected the request. Reconnect Workspace in settings with a super-admin account.",
        reason: "unauthorized",
      };
    }
    return { message: error.message, reason: error.reason };
  }
  if (error instanceof WorkspaceNotConnectedError) {
    return {
      message:
        "Google Workspace is not connected. Connect it in settings before approving members.",
      reason: "not_connected",
    };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: "Workspace provisioning failed." };
}

export async function provisionWorkspaceAccountForMember(
  input: ProvisionWorkspaceAccountInput,
): Promise<ProvisionWorkspaceAccountResult> {
  const password = generateRandomPassword(20);

  let workspaceUserId: string;
  let primaryEmail: string;
  try {
    const created = await createWorkspaceUser(input.orgId, {
      primaryEmail: input.primaryEmail,
      firstName: input.firstName,
      lastName: input.lastName,
      password,
    });
    workspaceUserId = created.id;
    primaryEmail = created.primaryEmail;
  } catch (error) {
    const { message, reason } = classifyError(error);
    await logMemberAuthEvent({
      orgId: input.orgId,
      memberId: input.memberId,
      actorUserId: input.actorUserId,
      eventType: "workspace_provision_failed",
      message,
      metadata: { reason, primaryEmail: input.primaryEmail },
    }).catch(() => undefined);
    return { success: false, error: message, reason };
  }

  const now = new Date();
  await db
    .update(tenantMembers)
    .set({
      workspaceUserEmail: primaryEmail,
      workspaceUserId: workspaceUserId,
      workspaceProvisionedAt: now,
      updatedAt: now,
    })
    .where(eq(tenantMembers.id, input.memberId));

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);

  const organizationName = org?.name ?? "Your organization";
  const memberName = [input.firstName, input.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || primaryEmail;
  const signInUrl = buildAbsoluteAppUrl("/auth");

  try {
    const resend = getResendClient();
    const from = getResendFromEmail();
    const { error } = await resend.emails.send(
      {
        from,
        to: [input.toEmail],
        subject: `Your ${organizationName} account is ready`,
        react: WorkspaceWelcomeEmail({
          organizationName,
          memberName,
          workspaceEmail: primaryEmail,
          temporaryPassword: password,
          signInUrl,
        }),
      },
      {
        idempotencyKey: `workspace-welcome/${input.memberId}/${workspaceUserId}`,
      },
    );
    if (error) throw new Error(error.message);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send welcome email.";
    await logMemberAuthEvent({
      orgId: input.orgId,
      memberId: input.memberId,
      actorUserId: input.actorUserId,
      eventType: "workspace_provision_failed",
      message,
      metadata: {
        reason: "email_send_failed",
        workspaceUserId,
        primaryEmail,
      },
    }).catch(() => undefined);
    return {
      success: true,
      workspaceUserId,
      primaryEmail,
    };
  }

  await logMemberAuthEvent({
    orgId: input.orgId,
    memberId: input.memberId,
    actorUserId: input.actorUserId,
    eventType: "workspace_provisioned",
    metadata: {
      workspaceUserId,
      primaryEmail,
      toEmail: input.toEmail,
    },
  }).catch(() => undefined);

  return { success: true, workspaceUserId, primaryEmail };
}
