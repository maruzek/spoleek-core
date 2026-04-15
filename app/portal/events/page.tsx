import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { requireCurrentMemberAccess } from "@/server/queries/access";

export default async function PortalEventsPage() {
  await requireCurrentMemberAccess();

  return (
    <AppPage
      eyebrow="Member portal"
      title="Your events will live here."
      description="Members will use this side of the app to discover events, RSVP, and handle event-linked self-service tasks."
    >
      <AppPlaceholder
        title="Portal events space ready"
        description="The shared shell is in place so event participation can be added without another navigation reset."
      />
    </AppPage>
  );
}
