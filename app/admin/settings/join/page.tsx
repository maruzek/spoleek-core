import { JoinPageSettingsForm } from "@/components/app/join-page-settings-form";
import { AppPage } from "@/components/app/app-page";
import { requireAdminAccess } from "@/server/queries/access";
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";

export default async function AdminJoinSettingsPage() {
  await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  const organization = await getAppOrganization();

  if (!organization) {
    throw new Error("Organization is not available.");
  }

  const policy = await getOrganizationPolicy(organization.id);

  if (!policy) {
    throw new Error("Organization policy setup is incomplete.");
  }

  return (
    <AppPage
      eyebrow="Administration"
      title="Shape the public join experience."
      description="Control the public-facing invitation copy and the legal text applicants must agree to before they can submit a membership application."
    >
      <JoinPageSettingsForm organization={organization} policy={policy} />
    </AppPage>
  );
}
