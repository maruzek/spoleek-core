import { AppPage } from "@/components/app/app-page";
import { MemberAdmin } from "@/components/app/member-admin";
import { getMembersAdminPageData } from "@/server/queries/members";
import type { TenantMember } from "@/server/db/schema";

type VisibleMemberStatus = Exclude<TenantMember["status"], "deleted">;

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const editMemberId =
    typeof params.edit === "string" && params.edit.length > 0
      ? params.edit
      : null;
  const data = await getMembersAdminPageData(editMemberId);

  return (
    <AppPage
      eyebrow={data.access.level === "full" ? "Org admin" : "Scoped admin"}
      title="Manage members & requests."
      description={data.access.description}
      tooltip={data.access.description}
    >
      <MemberAdmin
        access={data.access}
        members={
          data.members as Array<
            (typeof data.members)[number] & { status: VisibleMemberStatus }
          >
        }
        customFields={data.customFields}
        memberCategories={data.memberCategories}
        manageableGroupCategories={data.manageableGroupCategories}
        selectedMember={
          data.selectedMember
            ? {
                ...data.selectedMember,
                member: {
                  ...data.selectedMember.member,
                  status: data.selectedMember.member
                    .status as VisibleMemberStatus,
                },
              }
            : null
        }
        workspace={data.workspace}
      />
    </AppPage>
  );
}
