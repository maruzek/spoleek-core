import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { requireCurrentMemberAccess } from "@/server/queries/access";

export default async function PortalGroupsPage() {
  await requireCurrentMemberAccess({ requireProfileComplete: true });

  return (
    <AppPage
      eyebrow="Member portal"
      title="Your group memberships will appear here."
      description="Members will be able to see their current groups, categories, and delegated-structure context without stepping into administrative tools."
    >
      <AppPlaceholder
        title="Personal group view ready"
        description="This portal route is ready for the member-facing group overview."
      />
    </AppPage>
  );
}
