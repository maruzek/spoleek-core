"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

import {
  memberCustomFieldAnswersSchema,
} from "@/lib/member-custom-fields";
import { registrationGroupSelectionsSchema } from "@/lib/join";
import { authActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { tenantMembers } from "@/server/db/schema";
import {
  listRegistrationGroupCategories,
  syncRegistrationGroupSelections,
  validateRegistrationGroupSelections,
} from "@/server/lib/group-registration";
import { upsertMemberCustomFieldAnswers } from "@/server/lib/member-custom-field-values";
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";
import { listActiveMemberCustomFields } from "@/server/queries/member-custom-fields";
import {
  findShadowMemberForUser,
  getTenantMemberByUserId,
} from "@/server/queries/members";

const joinSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  acceptTerms: z
    .boolean()
    .refine((value) => value, "You must accept the organization terms."),
  acceptPrivacy: z
    .boolean()
    .refine((value) => value, "You must accept the privacy policy."),
  registrationGroupSelections: registrationGroupSelectionsSchema,
  customFieldAnswers: memberCustomFieldAnswersSchema.default({}),
});

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  customFieldAnswers: memberCustomFieldAnswersSchema.default({}),
});

export const joinOrganizationAction = authActionClient
  .metadata({ actionName: "joinOrganization" })
  .inputSchema(joinSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await getAppOrganization();

    if (!organization) {
      throw new Error("The application is not set up yet.");
    }

    const policy = await getOrganizationPolicy(organization.id);

    if (!policy) {
      throw new Error("Organization policy setup is incomplete.");
    }

    const existing = await getTenantMemberByUserId(organization.id, ctx.auth.user.id);
    const shadow = await findShadowMemberForUser(
      organization.id,
      ctx.auth.user.email,
    );
    const registrationFields = await listActiveMemberCustomFields(organization.id, [
      "registration",
    ]);
    const registrationGroupCategories = await listRegistrationGroupCategories(organization.id);

    const firstName = parsedInput.firstName.trim();
    const lastName = parsedInput.lastName.trim();
    const registrationSelections = await validateRegistrationGroupSelections({
      categories: registrationGroupCategories,
      selections: parsedInput.registrationGroupSelections,
    });

    if (Object.keys(registrationSelections.errors).length > 0) {
      return {
        success: false as const,
        status: existing?.status ?? shadow?.status ?? "pending",
        customFieldErrors: {} as Record<string, string[]>,
        registrationGroupErrors: registrationSelections.errors,
      };
    }

    const result = await db.transaction(async (tx) => {
      const patch = {
        firstName,
        lastName,
        acceptedTermsAt: new Date(),
        acceptedPrivacyAt: new Date(),
        updatedAt: new Date(),
      };

      let memberId = existing?.id ?? shadow?.id ?? null;
      let status = existing?.status ?? shadow?.status ?? "pending";

      if (existing) {
        await tx
          .update(tenantMembers)
          .set({
            ...patch,
            email: ctx.auth.user.email,
            status: existing.status === "active" ? "active" : "pending",
          })
          .where(eq(tenantMembers.id, existing.id));
      } else if (shadow) {
        await tx
          .update(tenantMembers)
          .set({
            ...patch,
            userId: ctx.auth.user.id,
            email: ctx.auth.user.email,
            linkedAt: new Date(),
            status: shadow.status === "active" ? "active" : "pending",
          })
          .where(eq(tenantMembers.id, shadow.id));
      } else {
        memberId = randomUUID();
        status = "pending";

        await tx.insert(tenantMembers).values({
          id: memberId,
          orgId: organization.id,
          userId: ctx.auth.user.id,
          email: ctx.auth.user.email,
          firstName,
          lastName,
          role: "member",
          status: "pending",
          linkedAt: new Date(),
          acceptedTermsAt: new Date(),
          acceptedPrivacyAt: new Date(),
        });
      }

      const targetMemberId = memberId ?? existing?.id ?? shadow?.id;

      if (!targetMemberId) {
        throw new Error("Unable to resolve the member record.");
      }

      const answerResult = await upsertMemberCustomFieldAnswers(tx, {
        orgId: organization.id,
        memberId: targetMemberId,
        fields: registrationFields,
        answers: parsedInput.customFieldAnswers,
      });

      if (Object.keys(answerResult.errors).length > 0) {
        return {
          success: false as const,
          status,
          customFieldErrors: answerResult.errors,
          registrationGroupErrors: {} as Record<string, string[]>,
        };
      }

      await syncRegistrationGroupSelections(tx, {
        orgId: organization.id,
        memberId: targetMemberId,
        registrationCategoryIds: registrationGroupCategories.map((category) => category.id),
        selections: registrationSelections.normalizedSelections,
      });

      return {
        success: true as const,
        status,
        customFieldErrors: {} as Record<string, string[]>,
        registrationGroupErrors: {} as Record<string, string[]>,
      };
    });

    return result;
  });

export const updateProfileAction = authActionClient
  .metadata({ actionName: "updateProfile" })
  .inputSchema(profileSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await getAppOrganization();

    if (!organization) {
      throw new Error("The application is not set up yet.");
    }

    const member = await getTenantMemberByUserId(organization.id, ctx.auth.user.id);

    if (!member) {
      returnValidationErrors(profileSchema, {
        firstName: {
          _errors: ["Join the organization before updating your profile."],
        },
      });
    }

    const activeFields = await listActiveMemberCustomFields(organization.id, [
      "registration",
      "post_approval",
      "optional",
    ]);

    const firstName = parsedInput.firstName.trim();
    const lastName = parsedInput.lastName.trim();
    const result = await db.transaction(async (tx) => {
      await tx
        .update(tenantMembers)
        .set({
          firstName,
          lastName,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tenantMembers.orgId, organization.id),
            eq(tenantMembers.userId, ctx.auth.user.id),
          ),
        );

      const answerResult = await upsertMemberCustomFieldAnswers(tx, {
        orgId: organization.id,
        memberId: member.id,
        fields: activeFields,
        answers: parsedInput.customFieldAnswers,
      });

      if (Object.keys(answerResult.errors).length > 0) {
        return {
          success: false as const,
          customFieldErrors: answerResult.errors,
        };
      }

      return {
        success: true as const,
        customFieldErrors: {} as Record<string, string[]>,
      };
    });

    return result;
  });
