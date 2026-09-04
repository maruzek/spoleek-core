"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { CheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import type { PaymentWithMember } from "@/components/app/payments/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatFeeAmount, getPaymentTitle } from "@/lib/payments";
import {
  cancelPaymentAction,
  markPaymentPaidAction,
  type CancellationReason,
} from "@/server/actions/payments";

const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  duplicate: "Duplicate payment",
  waived: "Fee waived",
  admin_error: "Admin error",
  other: "Other",
};

/** A payment can only be acted on while it is still owed. */
export function isPaymentActionable(payment: PaymentWithMember) {
  return payment.status !== "paid" && payment.status !== "cancelled";
}

export function MarkPaidDialog({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentWithMember;
  onSuccess: () => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [paidDate, setPaidDate] = useState(todayIso);
  const [adminNote, setAdminNote] = useState("");

  const markPaid = useAction(markPaymentPaidAction, {
    onSuccess() {
      toast.success("Payment marked as paid.");
      onOpenChange(false);
      onSuccess();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not update payment.");
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark payment as paid</AlertDialogTitle>
          <AlertDialogDescription>
            Confirm that <strong>{payment.memberName}</strong> has paid{" "}
            <strong>{formatFeeAmount(payment.amount, payment.currency)}</strong>{" "}
            for {getPaymentTitle(payment.type, payment.periodLabel)}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Payment date</FieldLabel>
            <DatePicker
              id="payment-paid-date"
              value={paidDate}
              endMonth={new Date()}
              disabledDates={{ after: new Date() }}
              onChange={setPaidDate}
            />
          </Field>
          <Field>
            <FieldLabel>Note (optional)</FieldLabel>
            <Textarea
              placeholder="Optional note (e.g. bank reference, receipt ID)"
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              rows={2}
            />
          </Field>
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              markPaid.execute({
                paymentId: payment.id,
                paidAt: paidDate ? new Date(paidDate).toISOString() : undefined,
                adminNote: adminNote.trim() || undefined,
              })
            }
            disabled={markPaid.isPending}
          >
            <CheckIcon data-icon="inline-start" />
            Mark as paid
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CancelPaymentDialog({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentWithMember;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState<CancellationReason | "">("");
  const [adminNote, setAdminNote] = useState("");

  const cancel = useAction(cancelPaymentAction, {
    onSuccess() {
      toast.success("Payment cancelled.");
      onOpenChange(false);
      onSuccess();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not cancel payment.");
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel payment</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently cancel the payment record for{" "}
            <strong>{payment.memberName}</strong>. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Reason</FieldLabel>
            <Select
              value={reason}
              onValueChange={(value) => setReason(value as CancellationReason)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CANCELLATION_REASON_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Note (optional)</FieldLabel>
            <Textarea
              placeholder="Optional note"
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              rows={2}
            />
          </Field>
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              cancel.execute({
                paymentId: payment.id,
                cancellationReason: reason as CancellationReason,
                adminNote: adminNote.trim() || undefined,
              })
            }
            disabled={!reason || cancel.isPending}
          >
            <XIcon data-icon="inline-start" />
            Cancel payment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Mark paid / Cancel, with their dialogs. Used by the payments dashboard rows,
 * the member payments tab, and the payment detail dialog, so an admin gets the
 * same two controls wherever a payment is shown.
 */
export function PaymentActions({
  payment,
  onSuccess,
  size = "sm",
}: {
  payment: PaymentWithMember;
  onSuccess: () => void;
  size?: "sm" | "default";
}) {
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!isPaymentActionable(payment)) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          size={size}
          variant="outline"
          onClick={() => setMarkPaidOpen(true)}
        >
          <CheckIcon data-icon="inline-start" />
          Mark paid
        </Button>
        <Button size={size} variant="ghost" onClick={() => setCancelOpen(true)}>
          <XIcon data-icon="inline-start" />
          Cancel
        </Button>
      </div>
      <MarkPaidDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        payment={payment}
        onSuccess={onSuccess}
      />
      <CancelPaymentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        payment={payment}
        onSuccess={onSuccess}
      />
    </>
  );
}
