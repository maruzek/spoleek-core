import { AppPage } from "@/components/app/app-page";
import {
  MembershipSettingsCard,
  type MembershipSettingsState,
} from "@/components/app/membership-settings-card";
import { requireAdminAccess } from "@/server/queries/access";
import { getAppOrganization } from "@/server/queries/app";

export default async function AdminMembershipSettingsPage() {
  await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  const organization = await getAppOrganization();

  if (!organization) {
    throw new Error("Organization is not available.");
  }

  const state: MembershipSettingsState = {
    membershipManagementMode: organization.membershipManagementMode,
    membershipRenewalMonth: organization.membershipRenewalMonth,
    membershipRenewalDay: organization.membershipRenewalDay,
    membershipFeeEnabled: organization.membershipFeeEnabled,
    membershipFeeAmount: organization.membershipFeeAmount,
    membershipFeeCurrency: organization.membershipFeeCurrency,
    membershipFeeBankAccount: organization.membershipFeeBankAccount,
  };

  return (
    <AppPage
      eyebrow="Administration"
      title="Membership management."
      description="Configure how memberships are managed and whether fee payments are required for renewal."
    >
      <MembershipSettingsCard state={state} />
    </AppPage>
  );
}
