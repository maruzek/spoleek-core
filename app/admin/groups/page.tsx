import { AppPage } from "@/components/app/app-page";
import { GroupCategoriesAdmin } from "@/components/app/group-categories-admin";
import { listAccessibleCategoryIds, requireGroupAdminModuleAccess } from "@/server/queries/access";
import { listGroupCategories, listPendingRequestCountsByCategory } from "@/server/queries/groups";

export default async function AdminGroupsPage() {
  const access = await requireGroupAdminModuleAccess();
  const [categoryRows, pendingByCategory] = await Promise.all([
    listGroupCategories(access.organization.id),
    listPendingRequestCountsByCategory(access.organization.id),
  ]);
  const categories = categoryRows.map((category) => ({
    ...category,
    pendingRequestCount: pendingByCategory.get(category.id) ?? 0,
  }));
  const canManageCategories =
    access.adminAccessLevel === "full" || access.member?.role === "leader";
  const scopedCategoryIds =
    access.adminAccessLevel === "full" || access.member?.role === "leader" || !access.member
      ? null
      : await listAccessibleCategoryIds(access.organization.id, access.member.id);

  return (
    <AppPage
      eyebrow="Administration"
      title="Groups"
      description="The layers your organisation is built from — each category holds its groups and decides how members are sorted into them."
    >
      <GroupCategoriesAdmin
        canManageCategories={canManageCategories}
        categories={
          scopedCategoryIds == null
            ? categories
            : categories.filter((category) => scopedCategoryIds.includes(category.id))
        }
      />
    </AppPage>
  );
}
