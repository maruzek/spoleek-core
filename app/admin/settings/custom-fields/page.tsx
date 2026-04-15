import { AppPage } from "@/components/app/app-page";
import { MemberCustomFieldsAdmin } from "@/components/app/member-custom-fields-admin";
import { requireOrgAdminAccess } from "@/server/queries/access";
import { listMemberCustomFields } from "@/server/queries/member-custom-fields";

export default async function AdminCustomFieldsPage() {
  const { organization } = await requireOrgAdminAccess();
  const fields = await listMemberCustomFields(organization.id);

  return (
    <AppPage
      eyebrow="Administration"
      title="Define member custom fields."
      description="Organization-wide member questions live here so registration and profile completion can adapt to each organization without hard-coded schema changes."
    >
      <MemberCustomFieldsAdmin fields={fields} />
    </AppPage>
  );
}
