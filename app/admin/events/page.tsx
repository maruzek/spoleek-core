import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { requireAdminAccess } from "@/server/queries/access";

export default async function AdminEventsPage() {
  await requireAdminAccess();

  return (
    <AppPage
      eyebrow="Administration"
      title="Event operations will live in the same admin frame."
      description="Staff-facing event setup, visibility rules, invitations, and linked forms will use the same sidebar shell as member management."
    >
      <AppPlaceholder
        title="Admin events space ready"
        description="The route and shell are in place so the events engine can plug into the admin experience without another navigation rewrite."
      />
    </AppPage>
  );
}
