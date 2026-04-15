import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { requireAdminAccess } from "@/server/queries/access";

export default async function AdminPaymentsPage() {
  await requireAdminAccess();

  return (
    <AppPage
      eyebrow="Administration"
      title="Payments will join the admin operations surface."
      description="Membership fees, event payments, and QR-payment workflows can now live beside members and events in the same admin shell."
    >
      <AppPlaceholder
        title="Payments area reserved"
        description="This route is ready for the future payment workflows without changing the app structure again."
      />
    </AppPage>
  );
}
