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
    <Card className="overflow-hidden transition-all hover:shadow-sm">
      <div className="flex flex-col sm:flex-row">
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-sm font-semibold font-sans text-muted-foreground uppercase tracking-wider">
              Period {payment.periodLabel}
            </h3>
            <Badge variant={isOverdue ? "destructive" : "secondary"}>
              {payment.status}
            </Badge>
          </div>

          <div className="mb-4">
            <div className="text-2xl font-bold tracking-tight">
              {(payment.amount / 100).toFixed(2)}{" "}
              <span className="text-sm font-medium text-muted-foreground">
                {payment.currency}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Due {formatDateTime(payment.dueAt)}</span>
              {isOverdue && (
                <span className="font-medium text-destructive">· Overdue</span>
              )}
            </div>
          </div>

          <div className="mt-auto space-y-3">
            {payment.bankAccount ? (
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                  Bank Account
                </p>
                <p className="font-mono text-xs break-all text-foreground/90">
                  {payment.bankAccount}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Bank account not configured.
              </p>
            )}
          </div>
        </div>

        {spdString && (
          <div className="relative flex items-center justify-center bg-muted/20 p-5 md:p-6 border-t sm:border-t-0 sm:border-l">
            <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent pointer-events-none" />
            <div className="relative group">
              <div className="absolute -inset-1 bg-linear-to-r from-primary/10 to-primary/5 rounded-xl blur-sm opacity-50 transition duration-500 group-hover:opacity-100" />
              <div className="relative flex size-28 items-center justify-center rounded-xl border bg-white p-1.5 shadow-sm transition-all duration-300 group-hover:scale-105 sm:size-32">
                <QRCode value={spdString} size={112} className="size-full" />
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
