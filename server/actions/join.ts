"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { joinApplicationSchema } from "@/lib/join";
import { actionClient } from "@/lib/safe-action";
import { db } from "@/server/db";
import { tenantMembers } from "@/server/db/schema";
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

    if (existingMember?.userId) {
      throw new Error("An account with this email already exists. Please sign in instead.");
    }

    const firstName = parsedInput.firstName.trim();
    const lastName = parsedInput.lastName.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const email = parsedInput.email.trim().toLowerCase();

    const result = await db.transaction(async (tx) => {
      const patch = {
        email,
        firstName,
        lastName,
        fullName,
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
        memberId = randomUUID();

        await tx.insert(tenantMembers).values({
          id: memberId,
          orgId: organization.id,
          userId: null,
          linkedAt: null,
          ...patch,
        });
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
        };
      }

      return {
        success: true as const,
        customFieldErrors: {} as Record<string, string[]>,
      };
    });

    return result;
  });
