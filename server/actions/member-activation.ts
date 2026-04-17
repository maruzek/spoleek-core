"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { memberCustomFieldAnswersSchema } from "@/lib/member-custom-fields";
import { actionClient } from "@/lib/safe-action";
import { db } from "@/server/db";
import { tenantMembers } from "@/server/db/schema";
import {
  getValidMemberInvite,
  markMemberInviteCompleted,
  markMemberInviteExpiredIfNeeded,
  registerActivationAttempt,
} from "@/server/lib/member-invites";
import {
  upsertMemberCustomFieldAnswers,
  validateMemberCustomFieldAnswers,
} from "@/server/lib/member-custom-field-values";
import { getAppOrganization } from "@/server/queries/app";
import { listActiveMemberCustomFields } from "@/server/queries/member-custom-fields";
import { getMemberById } from "@/server/queries/members";

const completeMemberActivationSchema = z
  .object({
    memberId: z.string().uuid(),
    token: z.string().min(1, "Invitation token is required."),
    password: z.string().min(12, "Password must be at least 12 characters long."),
    confirmPassword: z.string().min(1, "Confirm your password."),
    customFieldAnswers: memberCustomFieldAnswersSchema.default({}),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const completeMemberActivationAction = actionClient
  .metadata({ actionName: "completeMemberActivation" })
  .inputSchema(completeMemberActivationSchema)
  .action(async ({ parsedInput }) => {
    const organization = await getAppOrganization();

    if (!organization) {
      throw new Error("The application is not set up yet.");
    }

    await markMemberInviteExpiredIfNeeded(parsedInput.memberId);

    const member = await getMemberById(organization.id, parsedInput.memberId);

    if (!member || !["invited", "active"].includes(member.status) || !member.email) {
      throw new Error("This invitation is no longer available.");
    }

    const invite = await getValidMemberInvite({
      memberId: parsedInput.memberId,
      token: parsedInput.token,
    });

    if (!invite) {
      throw new Error("This invitation is invalid or expired. Ask an administrator for a new one.");
    }

    const activationAttempt = await registerActivationAttempt(parsedInput.memberId);

    if (activationAttempt.blocked) {
      throw new Error("Too many activation attempts were detected. Wait a few minutes and try the newest invite link again.");
    }

    if (!invite.provisionedUserId) {
      throw new Error("This invitation is no longer available.");
    }

    const postApprovalFields = await listActiveMemberCustomFields(organization.id, [
      "post_approval",
    ]);
    const validation = await validateMemberCustomFieldAnswers(
      postApprovalFields,
      parsedInput.customFieldAnswers,
    );

    if (Object.keys(validation.errors).length > 0) {
      return {
        success: false as const,
        customFieldErrors: validation.errors,
      };
    }

    const resetResult = await auth.api.resetPassword({
      body: {
        newPassword: parsedInput.password,
        token: parsedInput.token,
      },
      headers: await headers(),
    });

    if (!resetResult?.status) {
      throw new Error("Unable to set the password for this invitation.");
    }

    const result = await db.transaction(async (tx) => {
      const answerResult = await upsertMemberCustomFieldAnswers(tx, {
        orgId: organization.id,
        memberId: member.id,
        fields: postApprovalFields,
        answers: parsedInput.customFieldAnswers,
      });

      if (Object.keys(answerResult.errors).length > 0) {
        return {
          success: false as const,
          customFieldErrors: answerResult.errors,
        };
      }

      await tx
        .update(tenantMembers)
        .set({
          userId: invite.provisionedUserId,
          status: "active",
          linkedAt: member.linkedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tenantMembers.id, member.id));

      return {
        success: true as const,
        customFieldErrors: {} as Record<string, string[]>,
      };
    });

    if (!result.success) {
      return result;
    }

    await markMemberInviteCompleted({
      memberId: member.id,
      claimedUserId: invite.provisionedUserId,
    });

    const signInResult = await auth.api.signInEmail({
      body: {
        email: member.email,
        password: parsedInput.password,
        callbackURL: buildAbsoluteAppUrl("/portal"),
      },
      headers: await headers(),
    });

    if (!signInResult?.user?.id) {
      throw new Error("Your password was saved, but automatic sign-in failed.");
    }

    return result;
  });
