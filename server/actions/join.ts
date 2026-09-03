"use server";

import { after } from "next/server";
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
import {
  upsertMemberCustomFieldAnswers,
  validateMemberCustomFieldAnswers,
} from "@/server/lib/member-custom-field-values";
import {
  notifyRegistrationDuplicate,
  notifyRegistrationReceived,
  notifyRegistrationSubmitted,
} from "@/server/notifications/registration";
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

    // Validated up front, before the address is looked at, so that a submission
    // with bad answers fails the same way whether or not the address is already
    // registered. Validating inside the write path instead would make an error
    // response mean "this address is new", which is the leak this guards.
    const answerValidation = await validateMemberCustomFieldAnswers(
      registrationFields,
      parsedInput.customFieldAnswers,
    );

    if (Object.keys(answerValidation.errors).length > 0) {
      return {
        success: false as const,
        customFieldErrors: answerValidation.errors,
        registrationGroupErrors: {} as Record<string, string[]>,
      };
    }

    /**
     * A resubmission only overwrites an application that is still pending and has
     * no account behind it. Every other existing record — invited, active,
     * suspended, archived — is left untouched, so a stranger cannot edit a real
     * member's details by guessing their address.
     */
    const isResubmission =
      existingMember != null &&
      existingMember.userId == null &&
      existingMember.status === "pending";

    if (existingMember && !isResubmission) {
      const knownMemberId = existingMember.id;

      // Same response as a fresh application. The one signal that the address is
      // taken is an email, and it goes to the address itself.
      after(() =>
        notifyRegistrationDuplicate({ orgId: organization.id, memberId: knownMemberId }),
      );

      return {
        success: true as const,
        customFieldErrors: {} as Record<string, string[]>,
        registrationGroupErrors: {} as Record<string, string[]>,
      };
    }

    const acceptedAt = new Date();

    const memberId = await db.transaction(async (tx) => {
      const patch = {
        email,
        firstName,
        lastName,
        role: "member" as const,
        status: "pending" as const,
        acceptedTermsAt: acceptedAt,
        acceptedPrivacyAt: acceptedAt,
        acceptedPolicyVersion: policy.version,
        updatedAt: acceptedAt,
      };

      let targetMemberId = existingMember?.id ?? null;

      if (existingMember) {
        await tx.update(tenantMembers).set(patch).where(eq(tenantMembers.id, existingMember.id));
      } else {
        const [inserted] = await tx.insert(tenantMembers).values({
          orgId: organization.id,
          userId: null,
          linkedAt: null,
          ...patch,
        }).returning({ id: tenantMembers.id });

        targetMemberId = inserted!.id;
      }

      if (!targetMemberId) {
        throw new Error("Unable to resolve the applicant record.");
      }

      await upsertMemberCustomFieldAnswers(tx, {
        orgId: organization.id,
        memberId: targetMemberId,
        fields: registrationFields,
        answers: parsedInput.customFieldAnswers,
      });

      await syncRegistrationGroupSelections(tx, {
        orgId: organization.id,
        memberId: targetMemberId,
        registrationCategoryIds: registrationGroupCategories.map((category) => category.id),
        selections: registrationSelections.normalizedSelections,
      });

      return targetMemberId;
    });

    // Only once the application is committed, and never blocking the response:
    // the applicant should not wait on Resend, nor see an error if it is down.
    const groupIds = registrationSelections.normalizedSelections.map(
      (selection) => selection.groupId,
    );

    after(async () => {
      await notifyRegistrationReceived({ orgId: organization.id, memberId, groupIds });
      await notifyRegistrationSubmitted({ orgId: organization.id, memberId, groupIds });
    });

    return {
      success: true as const,
      customFieldErrors: {} as Record<string, string[]>,
      registrationGroupErrors: {} as Record<string, string[]>,
    };
  });
