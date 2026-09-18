import { notFound } from "next/navigation";

import { AppPage } from "@/components/app/app-page";
import { GroupDetail } from "@/components/app/group-detail";
import { requireGroupManagementAccess } from "@/server/queries/access";
import { getGroupDetailData } from "@/server/queries/groups";
import { getMembersAdminPageData } from "@/server/queries/members";
import { WORKSPACE_FIELD_MAP } from "@/server/lib/workspace/field-catalog";
import type { EnabledProvisionField } from "@/components/app/member-approve-workspace-dialog";
import { listWorkspaceGroupDrift } from "@/server/queries/workspace-group-drift";
import { listGroupWorkspaceLinks } from "@/server/queries/workspace-group-links";
import { getAppOrganization } from "@/server/queries/app";
import { getGroupReportView } from "@/server/queries/membership-reports";
import { orgFormatLocale } from "@/lib/i18n";

export default async function AdminGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string; groupId: string }>;
  searchParams: Promise<{ report?: string; tab?: string }>;
}) {
  const [{ categoryId, groupId }, { report: requestedReportId, tab }] =
    await Promise.all([params, searchParams]);
  const [access, organization] = await Promise.all([
    requireGroupManagementAccess(groupId),
    getAppOrganization(),
  ]);
  const [detail, membersTable, workspaceLinks, workspaceDrift, reportView] = await Promise.all([
    getGroupDetailData(access.organization.id, groupId),
    // The Members tab is the dashboard's table narrowed to this group.
    getMembersAdminPageData(null, { groupId }),
    listGroupWorkspaceLinks(access.organization.id, { groupId }),
    listWorkspaceGroupDrift(access.organization.id, {
      groupId,
      includeIgnored: true,
    }),
    // Returns null unless the module is on and this group is a reporting group,
    // so a group that does not report is never told it has a report to file.
    organization?.membershipReportEnabled
      ? getGroupReportView(access.organization.id, groupId, requestedReportId)
      : null,
  ]);

  if (!detail || detail.group.categoryId !== categoryId) {
    notFound();
  }

  const enabledProvisionFields = (membersTable.workspace.provisionFields ?? [])
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
      eyebrow={detail.group.categoryName}
      title={detail.group.name}
      description={detail.group.description ?? undefined}
    >
      <GroupDetail
        group={detail.group}
        members={detail.members}
        membersTable={{
          access: membersTable.access,
          members: membersTable.members,
          customFields: membersTable.customFields,
          memberCategories: membersTable.memberCategories,
          manageableGroupCategories: membersTable.manageableGroupCategories,
          workspace: membersTable.workspace,
          workspaceProvisionFields: enabledProvisionFields,
          orgUnitCategoryId: membersTable.workspace.orgUnitCategoryId,
        }}
        admins={detail.admins}
        requests={detail.requests}
        resources={detail.resources}
        initialTab={tab}
        assignableMembers={detail.assignableMembers}
        workspaceLinks={workspaceLinks}
        workspaceDrift={workspaceDrift}
        workspaceDomain={organization?.workspaceDomain ?? null}
        workspaceConnected={Boolean(organization?.workspaceConnectedAt)}
        canManageWorkspaceIntegration={
          access.adminAccessLevel === "full" || access.member?.role === "leader"
        }
        reportView={reportView}
        locale={orgFormatLocale(organization?.locale)}
      />
    </AppPage>
  );
}
