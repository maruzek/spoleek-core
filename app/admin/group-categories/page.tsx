import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { requireAdminAccess } from "@/server/queries/access";

export default async function AdminGroupCategoriesPage() {
  await requireAdminAccess();

  return (
    <AppPage
      eyebrow="Administration"
      title="Group categories will define structure and delegation."
      description="Org admins will choose which category acts as the delegated-management category so leader access can stay tightly scoped."
    >
      <AppPlaceholder
        title="Category settings coming next"
        description="This page is reserved for category setup, including the future special-category selection."
      />
    </AppPage>
  );
}
