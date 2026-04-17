import { AppPage } from "@/components/app/app-page";
import { MemberAdmin } from "@/components/app/member-admin";
import { requireAdminAccess } from "@/server/queries/access";
import { listMemberCustomFields } from "@/server/queries/member-custom-fields";
import {
  getMemberEditorData,
  listMembersTableCategories,
  listTenantMembers,
} from "@/server/queries/members";
import type { TenantMember } from "@/server/db/schema";

type VisibleMemberStatus = Exclude<TenantMember["status"], "deleted">;

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organization } = await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageMembers",
  });
  const params = searchParams ? await searchParams : {};
  const editMemberId =
    typeof params.edit === "string" && params.edit.length > 0 ? params.edit : null;
  const [members, customFields, memberCategories, selectedMember] = await Promise.all([
    listTenantMembers(organization.id),
    listMemberCustomFields(organization.id),
    listMembersTableCategories(organization.id),
    editMemberId ? getMemberEditorData(organization.id, editMemberId) : Promise.resolve(null),
  ]);

  return (
    <AppPage
      eyebrow="Org admin"
      title="Manage memberships, approvals, and shadow profiles."
      description="This screen remains the first operational slice for organization admins. It covers creating offline records, linking real users later, and approving pending join requests."
      tooltip="This screen remains the first operational slice for organization admins. It covers creating offline records, linking real users later, and approving pending join requests."
    >
      <MemberAdmin
        members={members as Array<(typeof members)[number] & { status: VisibleMemberStatus }>}
        customFields={customFields}
        memberCategories={memberCategories}
        selectedMember={
          selectedMember
            ? {
                ...selectedMember,
                member: {
                  ...selectedMember.member,
                  status: selectedMember.member.status as VisibleMemberStatus,
                },
              }
            : null
        }
      />
    </AppPage>
  );
}
