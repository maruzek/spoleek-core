import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { requireAdminAccess } from "@/server/queries/access";

export default async function AdminGroupsPage() {
  await requireAdminAccess();

  return (
    <AppPage
      eyebrow="Administration"
      title="Groups will become the center of delegated management."
      description="This section is where the organization-level group structure, leader assignments, and special-category delegation rules will live."
    >
      <AppPlaceholder
        title="Group management scaffolded"
        description="The shared shell and permissions model are ready for the future group and scoped-leader workflows."
      />
    </AppPage>
  );
}
