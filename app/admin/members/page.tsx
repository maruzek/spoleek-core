import { AppPage } from "@/components/app/app-page";
import { MemberAdmin } from "@/components/app/member-admin";
import { requireAdminAccess } from "@/server/queries/access";
import { listTenantMembers } from "@/server/queries/members";

export default async function AdminMembersPage() {
  const { organization } = await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageMembers",
  });
  const members = await listTenantMembers(organization.id);

  return (
    <AppPage
      eyebrow="Org admin"
      title="Manage memberships, approvals, and shadow profiles."
      description="This screen remains the first operational slice for organization admins. It covers creating offline records, linking real users later, and approving pending join requests."
    >
      <MemberAdmin members={members} />
    </AppPage>
  );
}
