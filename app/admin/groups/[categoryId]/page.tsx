import { notFound } from "next/navigation";

import { AppPage } from "@/components/app/app-page";
import { GroupCategoryDetail } from "@/components/app/group-category-detail";
import { canManageCategory, managesEveryGroup } from "@/lib/access/viewer";
import { requireCategoryOverviewAccess } from "@/server/queries/access";
import { requireViewer } from "@/server/queries/viewer";
import { getCategoryDetailData } from "@/server/queries/groups";
import { getAppOrganization } from "@/server/queries/app";
import { describeCategoryMembership, describeJoinPolicy } from "@/lib/group-category-display";

export default async function AdminGroupCategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = await params;
  const viewer = await requireViewer();
  const access = await requireCategoryOverviewAccess(viewer, categoryId);
  const hasFullCategoryVisibility = managesEveryGroup(viewer);
  const scopedGroupIds = hasFullCategoryVisibility
    ? null
    : viewer.scope.groups.map((group) => group.id);
  const canManageEntireCategory = canManageCategory(viewer, categoryId);

  const [detail, organization] = await Promise.all([
    getCategoryDetailData(access.organization.id, categoryId, {
      visibleGroupIds: canManageEntireCategory ? null : scopedGroupIds,
    }),
    getAppOrganization(),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <AppPage
      eyebrow={detail.category.isActive ? "Groups" : "Groups · Archived"}
      title={detail.category.name}
      description={
        detail.category.description ??
        `${describeCategoryMembership(detail.category)} ${describeJoinPolicy(detail.category.defaultJoinPolicy)}`
      }
    >
      <GroupCategoryDetail
        category={detail.category}
        groups={detail.groups}
        categoryAdmins={detail.categoryAdmins}
        assignableMembers={detail.assignableMembers}
        canCreateGroups={canManageEntireCategory}
        canManageCategoryAdmins={access.adminAccessLevel === "full"}
        canEditCategory={access.adminAccessLevel === "full" || access.member?.role === "leader"}
        workspaceConnected={Boolean(organization?.workspaceConnectedAt)}
        canManageWorkspaceIntegration={
          access.adminAccessLevel === "full" || access.member?.role === "leader"
        }
      />
    </AppPage>
  );
}
