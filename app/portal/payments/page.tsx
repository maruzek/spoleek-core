import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { requireCurrentMemberAccess } from "@/server/queries/access";

export default async function PortalPaymentsPage() {
  await requireCurrentMemberAccess({ requireProfileComplete: true });

  return (
    <AppPage
      eyebrow="Member portal"
      title="Your payment activity will live here."
      description="Members will use this space for fee visibility, payment instructions, and event-related payment steps."
    >
      <AppPlaceholder
        title="Portal payments space ready"
        description="The route now exists inside the shared application frame so payment workflows have a stable home."
      />
    </AppPage>
  );
}
