"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { memberCustomFieldAnswersSchema } from "@/lib/member-custom-fields";
import { actionClient } from "@/lib/safe-action";
import { db } from "@/server/db";
import { tenantMembers } from "@/server/db/schema";
import {
  getValidMemberInvite,
  markMemberInviteCompleted,
  markMemberInviteExpiredIfNeeded,
} from "@/server/lib/member-invites";
import {
  upsertMemberCustomFieldAnswers,
  validateMemberCustomFieldAnswers,
} from "@/server/lib/member-custom-field-values";
import { getAppOrganization } from "@/server/queries/app";
import { listActiveMemberCustomFields } from "@/server/queries/member-custom-fields";
import { getMemberById } from "@/server/queries/members";

const completeMemberActivationSchema = z.object({
  memberId: z.string().uuid(),
  token: z.string().min(1, "Invitation token is required."),
  password: z.string().min(8, "Password must be at least 8 characters long."),
  customFieldAnswers: memberCustomFieldAnswersSchema.default({}),
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

    if (!member || member.status !== "active" || !member.email || !member.userId) {
      throw new Error("This invitation is no longer available.");
    }

    const invite = await getValidMemberInvite({
      memberId: parsedInput.memberId,
      token: parsedInput.token,
    });

    if (!invite) {
      throw new Error("This invitation is invalid or expired. Ask an administrator for a new one.");
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

    await markMemberInviteCompleted(member.id);

    const signInResult = await auth.api.signInEmail({
      body: {
        email: member.email,
        password: parsedInput.password,
        callbackURL: "/portal",
      },
      headers: await headers(),
    });

    if (!signInResult?.user?.id) {
      throw new Error("Your password was saved, but automatic sign-in failed.");
    }

    return result;
  });
