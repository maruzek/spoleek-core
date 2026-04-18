import { notFound } from "next/navigation";

import { AppPage } from "@/components/app/app-page";
import { GroupCategoryDetail } from "@/components/app/group-category-detail";
import {
  listScopedCategoryIds,
  listScopedGroupIds,
  requireCategoryOverviewAccess,
} from "@/server/queries/access";
import { getCategoryDetailData } from "@/server/queries/groups";

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

  const detail = await getCategoryDetailData(
    access.organization.id,
    categoryId,
    {
      visibleGroupIds: canManageEntireCategory ? null : scopedGroupIds,
    },
  );

  if (!detail) {
    notFound();
  }

  return (
    <AppPage eyebrow="Groups" title={detail.category.name}>
      <GroupCategoryDetail
        category={detail.category}
        groups={detail.groups}
        categoryAdmins={detail.categoryAdmins}
        assignableMembers={detail.assignableMembers}
        canCreateGroups={canManageEntireCategory}
        canManageCategoryAdmins={access.adminAccessLevel === "full"}
      />
    </AppPage>
  );
}
