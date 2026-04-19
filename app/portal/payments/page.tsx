import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { PaymentQrCard } from "@/components/app/payment-qr-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { listPaymentsForMember } from "@/server/queries/payments";
import { PaymentsTable } from "./payments-table";

export default async function PortalPaymentsPage() {
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
  });

  const payments = await listPaymentsForMember(organization.id, member.id);
  const pendingPayments = payments.filter(
    (p) => p.status === "pending" || p.status === "overdue",
  );
  const historicalPayments = payments.filter(
    (p) => p.status === "paid" || p.status === "cancelled",
  );

  return (
    <AppPage
      eyebrow="Member portal"
      title="Your payments."
      description="Membership fee payment details and payment instructions."
    >
      {pendingPayments.length === 0 && historicalPayments.length === 0 ? (
        <AppPlaceholder
          title="No payments yet"
          description="Payment records will appear here when your membership fee is due."
        />
      ) : null}

      {pendingPayments.length > 0 ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold tracking-tight">Pending payments</h2>
            <p className="text-sm text-muted-foreground">
              Please settle these payments by scanning the QR code or using the bank details provided.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
