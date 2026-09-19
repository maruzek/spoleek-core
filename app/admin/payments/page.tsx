import { AppPage } from "@/components/app/app-page";
import { PaymentsAdmin } from "@/components/app/payments-admin";
import { PaymentsFinancialHealth } from "@/components/app/payments-financial-health";
import { EMPTY_PAYMENT_SCOPE } from "@/lib/payments/scope";
import { getPaymentScope, requireAdminAccess } from "@/server/queries/access";
import { getPaymentStats, listPaymentsForOrg } from "@/server/queries/payments";

export default async function AdminPaymentsPage() {
  const access = await requireAdminAccess({ capability: "canManagePayments" });

  const isFullAdmin = access.adminAccessLevel === "full";

  // Same scope the mutations enforce, so no row is listed that cannot be acted on.
  const scope = (await getPaymentScope(access)) ?? EMPTY_PAYMENT_SCOPE;
  const payments = await listPaymentsForOrg(access.organization.id, { scope });

  const stats = isFullAdmin
    ? await getPaymentStats(access.organization.id)
    : null;
  const currency = payments.find((p) => p.currency)?.currency ?? "CZK";

  return (
    <AppPage
      eyebrow="Administration"
      title="Payments"
      description="Membership fees and event fees: who owes what, who has paid, and what is owed back."
    >
      {stats && <PaymentsFinancialHealth stats={stats} currency={currency} />}
      <PaymentsAdmin payments={payments} isFullAdmin={isFullAdmin} />
    </AppPage>
  );
}
