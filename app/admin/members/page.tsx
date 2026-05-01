import { eq } from "drizzle-orm";

import { AppPage } from "@/components/app/app-page";
import { MemberAdmin } from "@/components/app/member-admin";
import type { EnabledProvisionField } from "@/components/app/member-approve-workspace-dialog";
import type { ImportGroupInfo } from "@/components/app/member-import/types";
import { db } from "@/server/db";
import { groups } from "@/server/db/schema";
import { getMembersAdminPageData } from "@/server/queries/members";
import { getAppOrganization } from "@/server/queries/app";
import { WORKSPACE_FIELD_MAP } from "@/server/lib/workspace/field-catalog";
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

  const organization = await getAppOrganization();
  const [data, orgGroups] = await Promise.all([
    getMembersAdminPageData(editMemberId),
    organization
      ? db
          .select({
            id: groups.id,
            name: groups.name,
            categoryId: groups.categoryId,
            workspaceOrgUnitPath: groups.workspaceOrgUnitPath,
          })
          .from(groups)
          .where(eq(groups.orgId, organization.id))
      : Promise.resolve([] as ImportGroupInfo[]),
  ]);

  const groupsById = new Map<string, ImportGroupInfo>(
    orgGroups.map((g) => [g.id, g]),
  );

  const enabledProvisionFields = (data.workspace.provisionFields ?? [])
    .filter((f) => f.enabled)
    .flatMap((f) => {
      const def = WORKSPACE_FIELD_MAP.get(f.fieldKey);
      if (!def) return [];
      const field: EnabledProvisionField = {
        fieldKey: f.fieldKey,
        enabled: f.enabled,
        required: f.required,
        source: f.source,
        label: def.label,
        type: def.type,
        placeholder: def.placeholder,
        description: def.description,
      };
      return [field];
    });

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
        workspaceProvisionFields={enabledProvisionFields}
        groupsById={groupsById}
        orgUnitCategoryId={data.workspace.orgUnitCategoryId}
      />
    </AppPage>
  );
}
