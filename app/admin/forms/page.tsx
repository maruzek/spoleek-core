import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { requireAdminAccess } from "@/server/queries/access";

export default async function AdminFormsPage() {
  await requireAdminAccess();

  return (
    <AppPage
      eyebrow="Administration"
      title="Forms will be managed from the admin workspace."
      description="Internal form builders, linked event forms, and administrative workflows can now share one consistent application frame."
    >
      <AppPlaceholder
        title="Forms management scaffolded"
        description="This page is a placeholder inside the new shell so the forms module can land on stable navigation."
      />
    </AppPage>
  );
}
