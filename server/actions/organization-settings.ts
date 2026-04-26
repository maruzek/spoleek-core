"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { joinPageSettingsSchema } from "@/lib/join";
import { membershipSettingsSchema } from "@/lib/membership";
import { decryptSecret } from "@/lib/crypto";
import { orgAdminActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import {
  groupCategories,
  organizationPolicies,
  organizations,
  workspaceConnections,
} from "@/server/db/schema";
import { requireOrgAdminAccess } from "@/server/queries/access";
import { WORKSPACE_FIELD_MAP } from "@/server/lib/workspace/field-catalog";
import { revokeWorkspaceToken } from "@/server/lib/workspace/oauth";
import {
  DEFAULT_WORKSPACE_EMAIL_TEMPLATE,
  renderWorkspaceEmailLocalPart,
} from "@/server/lib/workspace/email-template";

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

const workspaceDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a valid domain (e.g. spoleek.org).");

const workspaceTemplateSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (value) => {
      const local = renderWorkspaceEmailLocalPart({
        template: value,
        firstName: "Jane",
        lastName: "Doe",
      });
      return local.length > 0 && /^[a-z0-9._-]+$/.test(local);
    },
    {
      message:
        "Template must produce a valid email local part. Available tokens: {first}, {last}, {initial}.",
    },
  );

export const saveWorkspaceSettingsAction = orgAdminActionClient
  .metadata({ actionName: "saveWorkspaceSettings" })
  .inputSchema(
    z.object({
      moduleEnabled: z.boolean(),
      workspaceDomain: workspaceDomainSchema.optional().nullable(),
      emailTemplate: workspaceTemplateSchema.optional().nullable(),
      defaultEmailPreference: z.enum(["personal", "workspace"]),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    if (parsedInput.moduleEnabled && !parsedInput.workspaceDomain) {
      throw new Error(
        "Enter the Google Workspace domain before enabling the module.",
      );
    }

    await db
      .update(organizations)
      .set({
        workspaceModuleEnabled: parsedInput.moduleEnabled,
        workspaceDomain: parsedInput.workspaceDomain ?? organization.workspaceDomain,
        workspaceEmailTemplate:
          parsedInput.emailTemplate?.trim() ||
          organization.workspaceEmailTemplate ||
          DEFAULT_WORKSPACE_EMAIL_TEMPLATE,
        defaultEmailPreference: parsedInput.defaultEmailPreference,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organization.id));

    return { success: true };
  });

export const saveMembershipSettingsAction = orgAdminActionClient
  .metadata({ actionName: "saveMembershipSettings" })
  .inputSchema(membershipSettingsSchema)
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    const isPeriodicRenewal =
      parsedInput.membershipManagementMode === "periodic_renewal";

    await db
      .update(organizations)
      .set({
        membershipManagementMode: parsedInput.membershipManagementMode,
        membershipRenewalMonth: isPeriodicRenewal
          ? parsedInput.membershipRenewalMonth
          : null,
        membershipRenewalDay: isPeriodicRenewal
          ? parsedInput.membershipRenewalDay
          : null,
        membershipFeeEnabled: isPeriodicRenewal
          ? parsedInput.membershipFeeEnabled
          : false,
        membershipFeeAmount:
          isPeriodicRenewal && parsedInput.membershipFeeEnabled
            ? parsedInput.membershipFeeAmount
            : null,
        membershipFeeCurrency: parsedInput.membershipFeeCurrency,
        membershipFeeBankAccount:
          isPeriodicRenewal && parsedInput.membershipFeeEnabled
            ? parsedInput.membershipFeeBankAccount
            : null,
        membershipFeePaymentWindowDays:
          isPeriodicRenewal && parsedInput.membershipFeeEnabled
            ? parsedInput.membershipFeePaymentWindowDays
            : 30,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organization.id));

    return { success: true };
  });

const emailNotificationSettingsSchema = z.object({
  emailNotifyRenewalHeadsup: z.boolean(),
  emailNotifyRenewalHeadsupDaysBefore: z.number().int().min(1).max(30),
  emailNotifyOverdue: z.boolean(),
  emailNotifyPaymentConfirmed: z.boolean(),
});

export const saveEmailNotificationSettingsAction = orgAdminActionClient
  .metadata({ actionName: "saveEmailNotificationSettings" })
  .inputSchema(emailNotificationSettingsSchema)
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    await db
      .update(organizations)
      .set({
        emailNotifyRenewalHeadsup: parsedInput.emailNotifyRenewalHeadsup,
        emailNotifyRenewalHeadsupDaysBefore: parsedInput.emailNotifyRenewalHeadsupDaysBefore,
        emailNotifyOverdue: parsedInput.emailNotifyOverdue,
        emailNotifyPaymentConfirmed: parsedInput.emailNotifyPaymentConfirmed,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organization.id));

    return { success: true };
  });

export const disconnectWorkspaceAction = orgAdminActionClient
  .metadata({ actionName: "disconnectWorkspace" })
  .inputSchema(z.object({}).optional())
  .action(async () => {
    const { organization } = await requireOrgAdminAccess();

    const [connection] = await db
      .select()
      .from(workspaceConnections)
      .where(eq(workspaceConnections.orgId, organization.id))
      .limit(1);

    if (connection) {
      try {
        const refreshToken = decryptSecret(connection.refreshTokenEncrypted);
        await revokeWorkspaceToken(refreshToken);
      } catch (error) {
        console.warn("Failed to revoke Workspace token", error);
      }

      await db
        .update(workspaceConnections)
        .set({
          revokedAt: new Date(),
          accessToken: null,
          accessTokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(workspaceConnections.id, connection.id));
    }

    await db
      .update(organizations)
      .set({
        workspaceConnectedAt: null,
        workspaceAdminEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organization.id));

    return { success: true };
  });

export const setWorkspaceOrgUnitCategoryAction = orgAdminActionClient
  .metadata({ actionName: "setWorkspaceOrgUnitCategory" })
  .inputSchema(z.object({ categoryId: z.string().uuid().nullable() }))
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    await db.transaction(async (tx) => {
      await tx
        .update(groupCategories)
        .set({ specialCapability: null, updatedAt: new Date() })
        .where(
          and(
            eq(groupCategories.orgId, organization.id),
            eq(groupCategories.specialCapability, "workspace_org_unit"),
          ),
        );

      if (parsedInput.categoryId) {
        await tx
          .update(groupCategories)
          .set({
            specialCapability: "workspace_org_unit",
            selectionMode: "single",
            selectionRequired: true,
            defaultJoinPolicy: "admin_only",
            maxSelections: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(groupCategories.id, parsedInput.categoryId),
              eq(groupCategories.orgId, organization.id),
            ),
          );
      }
    });

    return { success: true };
  });

export const saveWorkspaceProvisionFieldsAction = orgAdminActionClient
  .metadata({ actionName: "saveWorkspaceProvisionFields" })
  .inputSchema(
    z.object({
      fields: z.array(
        z.object({
          fieldKey: z.string(),
          enabled: z.boolean(),
          required: z.boolean(),
        }),
      ),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { organization } = await requireOrgAdminAccess();

    const validated = parsedInput.fields.filter((f) =>
      WORKSPACE_FIELD_MAP.has(f.fieldKey),
    );

    await db
      .update(organizations)
      .set({
        workspaceProvisionFields: validated,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organization.id));

    return { success: true };
  });
