"use client";

import QRCode from "react-qr-code";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { MemberPayment } from "@/server/db/schema";

function buildSpdString(payment: MemberPayment): string | null {
  if (!payment.bankAccount) return null;
  const iban = payment.bankAccount.replace(/\s/g, "").toUpperCase();
  const amount = (payment.amount / 100).toFixed(2);
  return `SPD*1.0*ACC:${iban}*AM:${amount}*CC:${payment.currency}*MSG:${payment.periodLabel}`;
}

export function PaymentQrCard({ payment }: { payment: MemberPayment }) {
  const spdString = buildSpdString(payment);
  const isOverdue = payment.status === "overdue";

  return (
    <Card className="overflow-hidden transition-all hover:shadow-sm flex flex-row justify-between">
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle>{payment.periodLabel}</CardTitle>
          </div>
        </div>
      </CardHeader>
      {spdString && (
        <CardContent>
          <QRCode value={spdString} size={112} className="size-full" />
        </CardContent>
      )}
    </Card>
  );
}
