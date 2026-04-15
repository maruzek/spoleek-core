import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { requireCurrentMemberAccess } from "@/server/queries/access";

export default async function PortalFormsPage() {
  await requireCurrentMemberAccess({ requireProfileComplete: true });

  return (
    <AppPage
      eyebrow="Member portal"
      title="Your forms will be handled here."
      description="Event forms, onboarding forms, and other self-service submissions will stay in the portal so members do not need admin access."
    >
      <AppPlaceholder
        title="Portal forms space ready"
        description="This route reserves a stable place for member-facing forms inside the new shell."
      />
    </AppPage>
  );
}
