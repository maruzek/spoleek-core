import { notFound } from "next/navigation";

import { AppPage } from "@/components/app/app-page";
import { GroupDetail } from "@/components/app/group-detail";
import { requireGroupManagementAccess } from "@/server/queries/access";
import { getGroupDetailData } from "@/server/queries/groups";
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
  searchParams: Promise<{ report?: string }>;
}) {
  const [{ categoryId, groupId }, { report: requestedReportId }] =
    await Promise.all([params, searchParams]);
  const [access, organization] = await Promise.all([
    requireGroupManagementAccess(groupId),
    getAppOrganization(),
  ]);
  const [detail, workspaceLinks, workspaceDrift, reportView] = await Promise.all([
    getGroupDetailData(access.organization.id, groupId),
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

  return (
    <AppPage
      eyebrow="Groups"
      title={detail.group.name}
      description="Manage the member roster, delegated admins, and settings for this group."
    >
      <GroupDetail
        group={detail.group}
        members={detail.members}
        admins={detail.admins}
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
