"use server";

import { and, eq } from "drizzle-orm";

import { joinPageSettingsSchema } from "@/lib/join";
import { orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { organizationPolicies, organizations } from "@/server/db/schema";
import { requireOrgAdminAccess } from "@/server/queries/access";

export const saveJoinPageSettingsAction = orgAdminActionClient
  .metadata({ actionName: "saveJoinPageSettings" })
  .inputSchema(joinPageSettingsSchema)
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    await db.transaction(async (tx) => {
      await tx
        .update(organizations)
        .set({
          joinPageHeadline: parsedInput.joinPageHeadline.trim(),
          joinPageBody: parsedInput.joinPageBody.trim(),
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organization.id));

      await tx
        .update(organizationPolicies)
        .set({
          memberInviteEmailSubject: parsedInput.memberInviteEmailSubject.trim(),
          memberInviteEmailBody: parsedInput.memberInviteEmailBody.trim(),
          termsOfServiceLabel: parsedInput.termsOfServiceLabel.trim(),
          termsOfServiceText: parsedInput.termsOfServiceText.trim(),
          privacyPolicyLabel: parsedInput.privacyPolicyLabel.trim(),
          privacyPolicyText: parsedInput.privacyPolicyText.trim(),
          updatedAt: new Date(),
        })
        .where(and(eq(organizationPolicies.orgId, organization.id)));
    });

    return {
      success: true,
    };
  });
