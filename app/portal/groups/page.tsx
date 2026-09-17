import { AppPage } from "@/components/app/app-page";
import { PortalGroups } from "@/components/app/portal/portal-groups";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { getPortalGroupsData } from "@/server/queries/portal-groups";

export const dynamic = "force-dynamic";

export default async function PortalGroupsPage() {
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });

  const data = await getPortalGroupsData({ organization, memberId: member.id });

  return (
    <AppPage
      eyebrow="Member portal"
      title="My groups."
      description={`Your groups in ${organization.name}, who leads them, and what is next.`}
    >
      <PortalGroups data={data} />
    </AppPage>
  );
}
