import { AppPage } from "@/components/app/app-page";
import { AppPlaceholder } from "@/components/app/app-placeholder";
import { PaymentQrCard } from "@/components/app/payment-qr-card";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { requireViewer } from "@/server/queries/viewer";
import { listPaymentsForMember } from "@/server/queries/payments";
import { PaymentsTable } from "./payments-table";

export default async function PortalPaymentsPage() {
  const viewer = await requireViewer();
  const { member, organization } = await requireCurrentMemberAccess(viewer, {
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });

  const payments = await listPaymentsForMember(organization.id, member.id);

  // Refunds owed to the member lead, then overdue, so what needs attention is
  // immediately visible.
  const refundDuePayments = payments.filter((p) => p.status === "refund_due");
  const overduePayments = payments.filter((p) => p.status === "overdue");
  const pendingPayments = payments.filter((p) => p.status === "pending");
  const activePendingPayments = [...refundDuePayments, ...overduePayments, ...pendingPayments];
  const historicalPayments = payments.filter(
    (p) => p.status === "paid" || p.status === "cancelled",
  );
  const payerName = [member.firstName, member.lastName].filter(Boolean).join(" ");

  return (
    <AppPage
      eyebrow="Member portal"
      title="Your payments."
      description="Membership fees and event fees, with payment instructions."
    >
      {activePendingPayments.length === 0 && historicalPayments.length === 0 ? (
        <AppPlaceholder
          title="No payments yet"
          description="Payment records will appear here when a membership fee is due or you sign up for a paid event."
        />
      ) : null}

      {refundDuePayments.length > 0 ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold tracking-tight">Refunds due to you</h2>
            <p className="text-sm text-muted-foreground">
              You paid for an event you are no longer confirmed for. The organiser will return the money and contact you.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {refundDuePayments.map((payment) => (
              <PaymentQrCard
                key={payment.id}
                payment={payment}
                payerName={payerName}
                eventTitle={payment.eventTitle ?? undefined}
              />
            ))}
          </div>
        </div>
      ) : null}

      {overduePayments.length > 0 ? (
        <div className={refundDuePayments.length > 0 ? "mt-8 flex flex-col gap-6" : "flex flex-col gap-6"}>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold tracking-tight text-destructive">Overdue payments</h2>
            <p className="text-sm text-muted-foreground">
              These payments are past their due date. Please settle them as soon as possible.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {overduePayments.map((payment) => (
              <PaymentQrCard
                key={payment.id}
                payment={payment}
                payerName={payerName}
                eventTitle={payment.eventTitle ?? undefined}
              />
            ))}
          </div>
        </div>
      ) : null}

      {pendingPayments.length > 0 ? (
        <div className={overduePayments.length > 0 || refundDuePayments.length > 0 ? "mt-8 flex flex-col gap-6" : "flex flex-col gap-6"}>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold tracking-tight">Pending payments</h2>
            <p className="text-sm text-muted-foreground">
              Please settle these payments by scanning the QR code or using the bank details provided.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {pendingPayments.map((payment) => (
              <PaymentQrCard
                key={payment.id}
                payment={payment}
                payerName={payerName}
                eventTitle={payment.eventTitle ?? undefined}
              />
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
