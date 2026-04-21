import Link from "next/link";
import { SlidersHorizontalIcon } from "lucide-react";
import { and, eq, isNull } from "drizzle-orm";

import { AppPage } from "@/components/app/app-page";
import { AdminSettingsTabs } from "@/components/app/admin-settings-tabs";
import { Button } from "@/components/ui/button";
import { requireAdminAccess } from "@/server/queries/access";
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";
import { db } from "@/server/db";
import { workspaceConnections } from "@/server/db/schema";
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

  const [connection] = await db
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
    .limit(1);

  const membershipState: MembershipSettingsState = {
    membershipManagementMode: organization.membershipManagementMode,
    membershipRenewalMonth: organization.membershipRenewalMonth,
    membershipRenewalDay: organization.membershipRenewalDay,
    membershipFeeEnabled: organization.membershipFeeEnabled,
    membershipFeeAmount: organization.membershipFeeAmount,
    membershipFeeCurrency: organization.membershipFeeCurrency,
    membershipFeeBankAccount: organization.membershipFeeBankAccount,
    membershipFeePaymentWindowDays: organization.membershipFeePaymentWindowDays,
  };

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
        workspaceState={workspaceState}
        defaultTab={tab}
      />
    </AppPage>
  );
}
