"use server";

import { eq } from "drizzle-orm";

import { joinApplicationSchema } from "@/lib/join";
import { actionClient } from "@/lib/safe-action";
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
import { findTenantMemberByEmail } from "@/server/queries/members";

export const submitJoinApplicationAction = actionClient
  .metadata({ actionName: "submitJoinApplication" })
  .inputSchema(joinApplicationSchema)
  .action(async ({ parsedInput }) => {
    const organization = await getAppOrganization();

    if (!organization) {
      throw new Error("The application is not set up yet.");
    }

    const policy = await getOrganizationPolicy(organization.id);

    if (!policy) {
      throw new Error("Organization policy setup is incomplete.");
    }

    const existingMember = await findTenantMemberByEmail(organization.id, parsedInput.email);
    const registrationFields = await listActiveMemberCustomFields(organization.id, [
      "registration",
    ]);
    const registrationGroupCategories = await listRegistrationGroupCategories(organization.id);

    if (existingMember?.userId) {
      throw new Error("An account with this email already exists. Please sign in instead.");
    }

    const firstName = parsedInput.firstName.trim();
    const lastName = parsedInput.lastName.trim();
    const email = parsedInput.email.trim().toLowerCase();
    const registrationSelections = await validateRegistrationGroupSelections({
      categories: registrationGroupCategories,
      selections: parsedInput.registrationGroupSelections,
    });

    if (Object.keys(registrationSelections.errors).length > 0) {
      return {
        success: false as const,
        customFieldErrors: {} as Record<string, string[]>,
        registrationGroupErrors: registrationSelections.errors,
      };
    }

    const result = await db.transaction(async (tx) => {
      const patch = {
        email,
        firstName,
        lastName,
        role: "member" as const,
        status: "pending" as const,
        acceptedTermsAt: new Date(),
        acceptedPrivacyAt: new Date(),
        updatedAt: new Date(),
      };

      let memberId = existingMember?.id ?? null;

      if (existingMember) {
        await tx.update(tenantMembers).set(patch).where(eq(tenantMembers.id, existingMember.id));
      } else {
        const [inserted] = await tx.insert(tenantMembers).values({
          orgId: organization.id,
          userId: null,
          linkedAt: null,
          ...patch,
        }).returning({ id: tenantMembers.id });

        memberId = inserted!.id;
      }

      const targetMemberId = memberId ?? existingMember?.id;

      if (!targetMemberId) {
        throw new Error("Unable to resolve the applicant record.");
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
        customFieldErrors: {} as Record<string, string[]>,
        registrationGroupErrors: {} as Record<string, string[]>,
      };
    });

    return result;
  });
