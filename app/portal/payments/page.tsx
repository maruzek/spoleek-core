import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { PaymentQrCard } from "@/components/app/payment-qr-card";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { listPaymentsForMember } from "@/server/queries/payments";
import { PaymentsTable } from "./payments-table";

export default async function PortalPaymentsPage() {
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
  });

  const payments = await listPaymentsForMember(organization.id, member.id);

  // Overdue shown first so urgent items are immediately visible
  const overduePayments = payments.filter((p) => p.status === "overdue");
  const pendingPayments = payments.filter((p) => p.status === "pending");
  const activePendingPayments = [...overduePayments, ...pendingPayments];
  const historicalPayments = payments.filter(
    (p) => p.status === "paid" || p.status === "cancelled",
  );

  return (
    <AppPage
      eyebrow="Member portal"
      title="Your payments."
      description="Membership fee payment details and payment instructions."
    >
      {activePendingPayments.length === 0 && historicalPayments.length === 0 ? (
        <AppPlaceholder
          title="No payments yet"
          description="Payment records will appear here when your membership fee is due."
        />
      ) : null}

      {overduePayments.length > 0 ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold tracking-tight text-destructive">Overdue payments</h2>
            <p className="text-sm text-muted-foreground">
              These payments are past their due date. Please settle them as soon as possible.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {overduePayments.map((payment) => (
              <PaymentQrCard key={payment.id} payment={payment} />
            ))}
          </div>
        </div>
      ) : null}

      {pendingPayments.length > 0 ? (
        <div className={overduePayments.length > 0 ? "mt-8 flex flex-col gap-6" : "flex flex-col gap-6"}>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold tracking-tight">Pending payments</h2>
            <p className="text-sm text-muted-foreground">
              Please settle these payments by scanning the QR code or using the bank details provided.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {pendingPayments.map((payment) => (
              <PaymentQrCard key={payment.id} payment={payment} />
            ))}
          </div>
        </div>
      ) : null}

      {historicalPayments.length > 0 ? (
        <div className="mt-8 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold tracking-tight">Payment history</h2>
            <p className="text-sm text-muted-foreground">
              A list of your completed and cancelled payments.
            </p>
          </div>
          <PaymentsTable data={historicalPayments} />
        </div>
      ) : null}
    </AppPage>
  );
}
