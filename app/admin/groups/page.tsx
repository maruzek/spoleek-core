import { AppPage } from "@/components/app/app-page";
import { GroupCategoriesAdmin } from "@/components/app/group-categories-admin";
import { listAccessibleCategoryIds, requireGroupAdminModuleAccess } from "@/server/queries/access";
import { listGroupCategories } from "@/server/queries/groups";

export default async function AdminGroupsPage() {
  const access = await requireGroupAdminModuleAccess();
  const categories = await listGroupCategories(access.organization.id);
  const scopedCategoryIds =
    access.adminAccessLevel === "full" || access.member?.role === "leader" || !access.member
      ? null
      : await listAccessibleCategoryIds(access.organization.id, access.member.id);

  return (
    <AppPage
      eyebrow="Administration"
      title="Group categories define the structure of your organization."
      description="Manage category rules, registration hooks, delegated managers, and the groups that live inside each structural layer."
    >
      <GroupCategoriesAdmin
        categories={
          scopedCategoryIds == null
            ? categories
            : categories.filter((category) => scopedCategoryIds.includes(category.id))
        }
      />
    </AppPage>
  );
}
