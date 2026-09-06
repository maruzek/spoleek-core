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
import { generatePaymentForMember } from "@/server/lib/payment-lifecycle";
import { getAppOrganization } from "@/server/queries/app";
import { getDictionary } from "@/lib/i18n";
import { listActiveMemberCustomFields } from "@/server/queries/member-custom-fields";
import { getMemberById } from "@/server/queries/members";

// Server-only module, so the locale is resolvable at import time.
const t = getDictionary();

const completeMemberActivationSchema = z
  .object({
    memberId: z.string().uuid(),
    token: z.string().min(1, t.errors.tokenRequired),
    password: z.string().min(12, t.errors.passwordTooShort),
    confirmPassword: z.string().min(1, t.errors.confirmPasswordRequired),
    customFieldAnswers: memberCustomFieldAnswersSchema.default({}),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: t.errors.passwordsDoNotMatch,
  });

export const completeMemberActivationAction = actionClient
  .metadata({ actionName: "completeMemberActivation" })
  .inputSchema(completeMemberActivationSchema)
  .action(async ({ parsedInput }) => {
    const organization = await getAppOrganization();

    if (!organization) {
      throw new Error(t.errors.notSetUp);
    }

    await markMemberInviteExpiredIfNeeded(parsedInput.memberId);

    const member = await getMemberById(organization.id, parsedInput.memberId);

    if (!member || !["invited", "active"].includes(member.status) || !member.email) {
      throw new Error(t.errors.inviteUnavailable);
    }

    const invite = await getValidMemberInvite({
      memberId: parsedInput.memberId,
      token: parsedInput.token,
    });

    if (!invite) {
      throw new Error(t.errors.inviteInvalid);
    }

    const activationAttempt = await registerActivationAttempt(parsedInput.memberId);

    if (activationAttempt.blocked) {
      throw new Error(t.errors.tooManyAttempts);
    }

    if (!invite.provisionedUserId) {
      throw new Error(t.errors.inviteUnavailable);
    }

    const postApprovalFields = await listActiveMemberCustomFields(organization.id, [
      "post_approval",
    ]);
    const validation = await validateMemberCustomFieldAnswers(
      postApprovalFields,
      parsedInput.customFieldAnswers,
      t,
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
      throw new Error(t.errors.passwordNotSet);
    }

    const result = await db.transaction(async (tx) => {
      const answerResult = await upsertMemberCustomFieldAnswers(tx, {
        orgId: organization.id,
        memberId: member.id,
        fields: postApprovalFields,
        answers: parsedInput.customFieldAnswers,
        dict: t,
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

    await generatePaymentForMember(member.id, organization.id);

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
      throw new Error(t.errors.autoSignInFailed);
    }

    return result;
  });
