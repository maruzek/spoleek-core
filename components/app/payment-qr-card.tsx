"use client";

import QRCode from "react-qr-code";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { buildSpdString, getPaymentTitle } from "@/lib/payments";
import { useAppShell } from "@/components/app/app-shell-provider";
import { cn } from "@/lib/utils";
import type { MemberPayment } from "@/server/db/schema";

function formatIban(iban: string) {
  return iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export function PaymentQrCard({ payment }: { payment: MemberPayment }) {
  const { member } = useAppShell();
  const memberName =
    member
      ? [member.firstName, member.lastName].filter(Boolean).join(" ") || undefined
      : undefined;

  const spdString = buildSpdString(payment, memberName);
  const isOverdue = payment.status === "overdue";
  const isPending = payment.status === "pending";

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/8",
        isOverdue && "ring-destructive/30",
      )}
    >
      {/* Top accent bar */}
      <div
        className={cn(
          "h-1 w-full",
          isOverdue ? "bg-destructive" : "bg-primary",
        )}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {payment.type === "membership_fee" ? "Membership fee" : "Event fee"} · {payment.periodLabel}
          </p>
          <h2 className="font-heading text-lg font-medium leading-tight text-foreground">
            {getPaymentTitle(payment.type, payment.periodLabel)}
          </h2>
        </div>
        <Badge
          variant={isOverdue ? "destructive" : isPending ? "secondary" : "outline"}
          className="mt-0.5 shrink-0 capitalize"
        >
          {payment.status}
        </Badge>
      </div>

      {/* Amount */}
      <div className={cn(
        "mx-5 rounded-xl px-4 py-3",
        isOverdue ? "bg-destructive/5" : "bg-primary/5",
      )}>
        <p className="mb-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Amount due
        </p>
        <div className="flex items-baseline gap-2">
          <span className={cn(
            "font-heading text-3xl font-medium tabular-nums tracking-tight",
            isOverdue ? "text-destructive" : "text-foreground",
          )}>
            {(payment.amount / 100).toLocaleString("cs-CZ", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="font-mono text-sm font-medium text-muted-foreground">
            {payment.currency}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {isOverdue ? "⚠ Overdue since" : "Due by"}{" "}
          <span className={cn("font-medium", isOverdue && "text-destructive")}>
            {formatDateTime(payment.dueAt)}
          </span>
        </p>
      </div>

      {/* Dashed receipt divider */}
      <div className="my-3 border-t border-dashed border-foreground/10" />

      {/* Payment details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-5">
        {payment.bankAccount && (
          <div className="col-span-2">
            <p className="mb-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Bank account
            </p>
            <p className="font-mono text-sm tracking-wide text-foreground">
              {formatIban(payment.bankAccount)}
            </p>
          </div>
        )}

        {payment.variableSymbol && (
          <div>
            <p className="mb-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Variable symbol
            </p>
            <p className="font-mono text-sm font-semibold tracking-widest text-foreground">
              {payment.variableSymbol}
            </p>
          </div>
        )}

        {memberName && (
          <div>
            <p className="mb-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Payer
            </p>
            <p className="text-sm font-medium text-foreground">{memberName}</p>
          </div>
        )}
      </div>

      {/* QR code */}
      {spdString && (
        <>
          {/* Perforated tear line */}
          <div className="relative my-3 flex items-center">
            <div className="absolute -left-3 size-6 rounded-full bg-background ring-1 ring-foreground/8" />
            <div className="absolute -right-3 size-6 rounded-full bg-background ring-1 ring-foreground/8" />
            <div className="w-full border-t border-dashed border-foreground/15" />
          </div>

          <div className="flex items-center gap-4 px-5 pb-5">
            <div className="rounded-xl border border-foreground/8 bg-white p-3 shadow-sm">
              <QRCode value={spdString} size={112} />
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Scan to pay
              </p>
              <p className="font-mono text-[10px] text-muted-foreground/60 leading-relaxed">
                Open your banking app and scan this code to complete the payment
              </p>
            </div>
          </div>
        </>
      )}

      {!spdString && payment.bankAccount == null && (
        <p className="px-5 pb-5 text-sm italic text-muted-foreground">
          Bank account not configured. Contact your organization.
        </p>
      )}
    </div>
  );
}
