"use client";

import { PaymentQrCard } from "@/components/app/payment-qr-card";
import type { EventPaymentView } from "@/lib/events/payment-plan";
import type { Dictionary } from "@/lib/i18n/messages";
import type { EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

/**
 * "Your payment" under the RSVP control: the QR card while a live payment
 * exists (pending, overdue, paid, refund due), a short note for a yes on the
 * reserve list, nothing otherwise. Shared by the portal and the token page.
 */
export function EventPaymentCard({
  payment,
  current,
  priced,
  eventTitle,
  payerName,
  t,
}: {
  payment: EventPaymentView | null;
  current: { answer: EventRsvpAnswer; standing: EventRsvpStanding } | null;
  priced: boolean;
  eventTitle: string;
  payerName?: string;
  t: Dictionary["events"]["detail"]["payment"];
}) {
  if (payment) {
    return <PaymentQrCard payment={{ ...payment, type: "event" }} payerName={payerName} eventTitle={eventTitle} showEventTitle={false} />;
  }

  if (priced && current?.answer === "yes" && current.standing === "reserve") {
    return (
      <div className="rounded-xl border border-dashed px-4 py-3 text-sm">
        <p className="font-medium">{t.reserveTitle}</p>
        <p className="text-muted-foreground">{t.reserveBody}</p>
      </div>
    );
  }

  return null;
}
