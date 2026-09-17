import { notFound } from "next/navigation";

import { AppPage } from "@/components/app/app-page";
import { GroupCategoryDetail } from "@/components/app/group-category-detail";
import {
  listScopedCategoryIds,
  listScopedGroupIds,
  requireCategoryOverviewAccess,
} from "@/server/queries/access";
import { getCategoryDetailData } from "@/server/queries/groups";
import { getAppOrganization } from "@/server/queries/app";
import { describeCategoryMembership, describeJoinPolicy } from "@/lib/group-category-display";

export default async function AdminGroupCategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = await params;
  const access = await requireCategoryOverviewAccess(categoryId);
  const hasFullCategoryVisibility =
    access.adminAccessLevel === "full" ||
    access.member?.role === "leader" ||
    !access.member;

  const [scopedCategoryIds, scopedGroupIds] = hasFullCategoryVisibility
    ? [null, null]
    : await Promise.all([
        listScopedCategoryIds(access.organization.id, access.member.id),
        listScopedGroupIds(access.organization.id, access.member.id),
      ]);

  const canManageEntireCategory =
    hasFullCategoryVisibility ||
    scopedCategoryIds?.includes(categoryId) === true;

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
        workspaceConnected={Boolean(organization?.workspaceConnectedAt)}
        canManageWorkspaceIntegration={
          access.adminAccessLevel === "full" || access.member?.role === "leader"
        }
      />
    </AppPage>
  );
}
