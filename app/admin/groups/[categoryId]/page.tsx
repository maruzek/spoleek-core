import { notFound } from "next/navigation";

import { AppPage } from "@/components/app/app-page";
import { GroupCategoryDetail } from "@/components/app/group-category-detail";
import { requireCategoryManagementAccess } from "@/server/queries/access";
import { getCategoryDetailData } from "@/server/queries/groups";

export default async function AdminGroupCategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = await params;
  const access = await requireCategoryManagementAccess(categoryId);
  const detail = await getCategoryDetailData(access.organization.id, categoryId);

  if (!detail) {
    notFound();
  }

  return (
    <AppPage
      eyebrow="Groups"
      title={detail.category.name}
      description="Manage the groups inside this category and the category-level admins who oversee them."
    >
      <GroupCategoryDetail
        category={detail.category}
        groups={detail.groups}
        categoryAdmins={detail.categoryAdmins}
        assignableMembers={detail.assignableMembers}
        canManageCategoryAdmins={access.adminAccessLevel === "full"}
      />
    </AppPage>
  );
}
