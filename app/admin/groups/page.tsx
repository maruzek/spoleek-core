import { AppPage } from "@/components/app/app-page";
import { GroupCategoriesAdmin } from "@/components/app/group-categories-admin";
import { managesEveryGroup, overseenCategoryIds } from "@/lib/access/viewer";
import { requireGroupAdminModuleAccess } from "@/server/queries/access";
import { requireViewer } from "@/server/queries/viewer";
import { listGroupCategories, listPendingRequestCountsByCategory } from "@/server/queries/groups";

export default async function AdminGroupsPage() {
  const viewer = await requireViewer();
  const access = await requireGroupAdminModuleAccess(viewer);
  const [categoryRows, pendingByCategory] = await Promise.all([
    listGroupCategories(access.organization.id),
    listPendingRequestCountsByCategory(access.organization.id),
  ]);
  const categories = categoryRows.map((category) => ({
    ...category,
    pendingRequestCount: pendingByCategory.get(category.id) ?? 0,
  }));
  const canManageCategories = managesEveryGroup(viewer);
  const scopedCategoryIds = overseenCategoryIds(viewer);

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
