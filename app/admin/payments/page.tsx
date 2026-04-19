import { AppPage } from "@/components/app/app-page";
import { PaymentsAdmin } from "@/components/app/payments-admin";
import { requireAdminAccess } from "@/server/queries/access";
import { listMemberIdsInGroups, listPaymentsForOrg } from "@/server/queries/payments";
import { listScopedGroupIds } from "@/server/queries/access";

export default async function AdminPaymentsPage() {
  const access = await requireAdminAccess({ capability: "canManagePayments" });

  const isFullAdmin = access.adminAccessLevel === "full";

  let payments;

  if (isFullAdmin || !access.member) {
    payments = await listPaymentsForOrg(access.organization.id);
  } else {
    const groupIds = await listScopedGroupIds(access.organization.id, access.member.id);
    const memberIds = await listMemberIdsInGroups(access.organization.id, groupIds);
    payments = await listPaymentsForOrg(access.organization.id, { memberIds });
  }

  return (
    <AppPage
      eyebrow="Administration"
      title="Membership payments."
      description="Track and manage fee payment records for all active members."
    >
      <PaymentsAdmin payments={payments} isFullAdmin={isFullAdmin} />
    </AppPage>
  );
}
