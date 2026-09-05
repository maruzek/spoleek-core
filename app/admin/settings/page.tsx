import Link from "next/link";
import { SlidersHorizontalIcon } from "lucide-react";
import { and, eq, isNull } from "drizzle-orm";

import { AppPage } from "@/components/app/app-page";
import { DEFAULT_SORT_LOCALE, isSortLocaleTag } from "@/lib/collation";
import { AdminSettingsTabs } from "@/components/app/admin-settings-tabs";
import { Button } from "@/components/ui/button";
import { requireAdminAccess } from "@/server/queries/access";
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";
import { listGroupCategories } from "@/server/queries/groups";
import { listGroupWorkspaceLinks } from "@/server/queries/workspace-group-links";
import { db } from "@/server/db";
import { memberCustomFields, workspaceConnections } from "@/server/db/schema";
import type { EmailNotificationSettingsState } from "@/components/app/email-notification-settings-card";
import type { MembershipSettingsState } from "@/components/app/membership-settings-card";
import type { WorkspaceSettingsState } from "@/components/app/workspace-settings-card";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  const { tab } = await searchParams;

  const organization = await getAppOrganization();

  if (!organization) {
    throw new Error("Organization is not available.");
  }

  const policy = await getOrganizationPolicy(organization.id);

  if (!policy) {
    throw new Error("Organization policy setup is incomplete.");
  }

  const [categories, connections, customFields, workspaceLinks] = await Promise.all([
    listGroupCategories(organization.id),
    db
      .select({
        grantedByEmail: workspaceConnections.grantedByEmail,
        grantedAt: workspaceConnections.grantedAt,
      })
      .from(workspaceConnections)
      .where(
        and(
          eq(workspaceConnections.orgId, organization.id),
          isNull(workspaceConnections.revokedAt),
        ),
      )
      .limit(1),
    db
      .select({ key: memberCustomFields.key, label: memberCustomFields.label })
      .from(memberCustomFields)
      .where(
        and(
          eq(memberCustomFields.orgId, organization.id),
          eq(memberCustomFields.isActive, true),
        ),
      ),
    listGroupWorkspaceLinks(organization.id),
  ]);
  const [connection] = connections;

  const membershipState: MembershipSettingsState = {
    membershipManagementMode: organization.membershipManagementMode,
    membershipRenewalMonth: organization.membershipRenewalMonth,
    membershipRenewalDay: organization.membershipRenewalDay,
    membershipFeeEnabled: organization.membershipFeeEnabled,
    membershipFeeAmount: organization.membershipFeeAmount,
    membershipFeeCurrency: organization.membershipFeeCurrency,
    membershipFeeBankAccount: organization.membershipFeeBankAccount,
    membershipFeePaymentWindowDays: organization.membershipFeePaymentWindowDays,
    membershipPeriodMode: organization.membershipPeriodMode,
    membershipReportEnabled: organization.membershipReportEnabled,
    membershipReportAllowSelfApproval:
      organization.membershipReportAllowSelfApproval,
    membershipReportConfirmMonth: organization.membershipReportConfirmMonth,
    membershipReportConfirmDay: organization.membershipReportConfirmDay,
  };

  // The yearly report has one row per group in the fee-managing category, so
  // the settings toggle names it — and stays disabled when there isn't one.
  const feeManagingCategory = categories.find((c) => c.managesMembershipFees);

  const emailNotificationState: EmailNotificationSettingsState = {
    emailNotifyRenewalHeadsup: organization.emailNotifyRenewalHeadsup,
    emailNotifyRenewalHeadsupDaysBefore: organization.emailNotifyRenewalHeadsupDaysBefore,
    emailNotifyOverdue: organization.emailNotifyOverdue,
    emailNotifyPaymentConfirmed: organization.emailNotifyPaymentConfirmed,
    emailNotifyReportReminder: organization.emailNotifyReportReminder,
    emailNotifyRegistration: organization.emailNotifyRegistration,
    emailNotifyRegistrationOrgAdmins: organization.emailNotifyRegistrationOrgAdmins,
    registrationNotificationEmail: organization.registrationNotificationEmail,
  };

  const workspaceOrgUnitCategory = categories.find(
    (c) => c.specialCapability === "workspace_org_unit",
  );

  const workspaceState: WorkspaceSettingsState = {
    moduleEnabled: Boolean(organization.workspaceModuleEnabled),
    connected: Boolean(organization.workspaceConnectedAt),
    domain: organization.workspaceDomain ?? null,
    emailTemplate: organization.workspaceEmailTemplate ?? "{first}.{last}",
    adminEmail:
      organization.workspaceAdminEmail ?? connection?.grantedByEmail ?? null,
    connectedAt:
      organization.workspaceConnectedAt?.toISOString() ??
      connection?.grantedAt?.toISOString() ??
      null,
    defaultEmailPreference: organization.defaultEmailPreference,
    groupCategories: categories.map((c) => ({ id: c.id, name: c.name })),
    workspaceOrgUnitCategoryId: workspaceOrgUnitCategory?.id ?? null,
    provisionFields: (organization.workspaceProvisionFields ?? []) as import("@/server/lib/workspace/field-catalog").WorkspaceProvisionFieldConfig[],
    customFields,
  };

  const localizationState = {
    membersSortLocale: isSortLocaleTag(organization.membersSortLocale)
      ? organization.membersSortLocale
      : DEFAULT_SORT_LOCALE,
  };

  return (
    <AppPage
      eyebrow="Administration"
      title="Settings"
      description="Manage your organization's join experience, membership rules, and integrations."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/settings/custom-fields">
            <SlidersHorizontalIcon data-icon="inline-start" />
            Custom fields
          </Link>
        </Button>
      }
    >
      <AdminSettingsTabs
        organization={organization}
        policy={policy}
        membershipState={membershipState}
        membershipLocale={organization.locale}
        feeManagingCategoryName={feeManagingCategory?.name ?? null}
        localizationState={localizationState}
        emailNotificationState={emailNotificationState}
        workspaceState={workspaceState}
        workspaceLinks={workspaceLinks}
        defaultTab={tab}
      />
    </AppPage>
  );
}
