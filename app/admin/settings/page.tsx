import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { requireAdminAccess } from "@/server/queries/access";

export default async function AdminSettingsPage() {
  await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  return (
    <AppPage
      eyebrow="Administration"
      title="Organization-level settings remain restricted."
      description="Only full organization admins should manage high-impact organization settings, policies, and future workspace integrations."
    >
      <AppPlaceholder
        title="Admin settings reserved"
        description="This route is intentionally limited to full admins so scoped leaders never drift into organization-wide controls."
      />
    </AppPage>
  );
}
