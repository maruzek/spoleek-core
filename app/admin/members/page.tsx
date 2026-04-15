import { AppShell } from "@/components/app/shell";
import { MemberAdmin } from "@/components/app/member-admin";
import { listTenantMembers } from "@/server/queries/members";
import { requireOrgAdminAccess } from "@/server/queries/access";

export default async function AdminMembersPage() {
  const { organization } = await requireOrgAdminAccess();
  const members = await listTenantMembers(organization.id);

  return (
    <AppShell
      eyebrow="Org admin"
      title="Manage memberships, approvals, and shadow profiles."
      description="This screen is the first operational slice for organization admins. It covers the essentials: creating offline records, linking real users later, and approving pending join requests."
    >
      <MemberAdmin members={members} />
    </AppShell>
  );
}
