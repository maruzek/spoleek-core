"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { CheckIcon, EllipsisIcon, UndoIcon, XIcon } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EventPaymentCancellationReason } from "@/lib/events/schemas";
import { formatFeeAmount, getPaymentTitle } from "@/lib/payments";
import {
  cancelEventPaymentAction,
  markEventPaymentPaidAction,
  markEventPaymentRefundedAction,
} from "@/server/actions/events";
import {
  cancelPaymentAction,
  markPaymentPaidAction,
  markPaymentRefundedAction,
  type CancellationReason,
} from "@/server/actions/payments";

const CANCELLATION_REASON_LABELS: Record<EventPaymentCancellationReason, string> = {
  duplicate: "Duplicate payment",
  waived: "Fee waived",
  admin_error: "Admin error",
  other: "Other",
  rsvp_withdrawn: "RSVP withdrawn",
};

/**
 * Which door the action goes through. `admin` is the payments dashboard
 * (`canManagePayments`); `event` is the event's response list, open to
 * whoever manages the event. Both end in the same status helpers.
 */
export type PaymentActionScope = "admin" | "event";

/** The slice of a payment the dialogs need; event rows are not full `MemberPayment`s. */
export type ActionablePayment = Pick<
  PaymentWithMember,
  "id" | "status" | "amount" | "currency" | "type" | "periodLabel" | "memberName"
>;

/** A payment can be acted on while it is owed, or while a refund is owed back. */
export function isPaymentActionable(payment: Pick<ActionablePayment, "status">) {
  return payment.status !== "paid" && payment.status !== "cancelled";
}

export function MarkPaidDialog({
  open,
  onOpenChange,
  payment,
  scope = "admin",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: ActionablePayment;
  scope?: PaymentActionScope;
  onSuccess: () => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [paidDate, setPaidDate] = useState(todayIso);
  const [adminNote, setAdminNote] = useState("");

  const markPaid = useAction(scope === "event" ? markEventPaymentPaidAction : markPaymentPaidAction, {
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
  scope = "admin",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: ActionablePayment;
  scope?: PaymentActionScope;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState<EventPaymentCancellationReason | "">("");
  const [adminNote, setAdminNote] = useState("");

  const done = {
    onSuccess() {
      toast.success("Payment cancelled.");
      onOpenChange(false);
      onSuccess();
    },
    onError({ error }: { error: { serverError?: string } }) {
      toast.error(error.serverError ?? "Could not cancel payment.");
    },
  };
  const cancelAdmin = useAction(cancelPaymentAction, done);
  const cancelEvent = useAction(cancelEventPaymentAction, done);
  const cancel = scope === "event" ? cancelEvent : cancelAdmin;
  // "RSVP withdrawn" only makes sense for an event payment.
  const reasons = Object.entries(CANCELLATION_REASON_LABELS).filter(
    ([value]) => payment.type === "event" || value !== "rsvp_withdrawn",
  );

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
              onValueChange={(value) => setReason(value as EventPaymentCancellationReason)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {reasons.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
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
            onClick={() => {
              if (!reason) return;
              const adminNoteValue = adminNote.trim() || undefined;
              if (scope === "event") {
                cancelEvent.execute({ paymentId: payment.id, reason, adminNote: adminNoteValue });
              } else if (reason !== "rsvp_withdrawn") {
                cancelAdmin.execute({
                  paymentId: payment.id,
                  cancellationReason: reason as CancellationReason,
                  adminNote: adminNoteValue,
                });
              }
            }}
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
 * `refund_due → cancelled (refunded)`: the organiser has paid the money back.
 */
export function MarkRefundedDialog({
  open,
  onOpenChange,
  payment,
  scope = "admin",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: ActionablePayment;
  scope?: PaymentActionScope;
  onSuccess: () => void;
}) {
  const refund = useAction(
    scope === "event" ? markEventPaymentRefundedAction : markPaymentRefundedAction,
    {
      onSuccess() {
        toast.success("Refund recorded.");
        onOpenChange(false);
        onSuccess();
      },
      onError({ error }) {
        toast.error(error.serverError ?? "Could not record the refund.");
      },
    },
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark as refunded</AlertDialogTitle>
          <AlertDialogDescription>
            Confirm that <strong>{formatFeeAmount(payment.amount, payment.currency)}</strong> has been
            returned to <strong>{payment.memberName}</strong> for{" "}
            {getPaymentTitle(payment.type, payment.periodLabel)}. The record closes as refunded.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => refund.execute({ paymentId: payment.id })}
            disabled={refund.isPending}
          >
            <UndoIcon data-icon="inline-start" />
            Mark refunded
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Mark paid, with Cancel behind a `⋯` menu (or Mark refunded for a refund-due
 * row), with their dialogs. Used by the payments dashboard rows, the member
 * payments tab, the payment detail dialog and the event response list, so an
 * admin gets the same controls wherever a payment is shown. Cancel is the rare
 * action, so it does not get a labelled button on every row.
 */
export function PaymentActions({
  payment,
  onSuccess,
  scope = "admin",
  size = "sm",
}: {
  payment: ActionablePayment;
  onSuccess: () => void;
  scope?: PaymentActionScope;
  size?: "sm" | "default";
}) {
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  if (!isPaymentActionable(payment)) {
    return null;
  }

  if (payment.status === "refund_due") {
    return (
      <>
        <Button size={size} variant="outline" onClick={() => setRefundOpen(true)}>
          <UndoIcon data-icon="inline-start" />
          Mark refunded
        </Button>
        <MarkRefundedDialog
          open={refundOpen}
          onOpenChange={setRefundOpen}
          payment={payment}
          scope={scope}
          onSuccess={onSuccess}
        />
      </>
    );
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size={size === "sm" ? "icon-sm" : "icon"} variant="ghost" aria-label="More actions">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => setCancelOpen(true)}>
              <XIcon />
              Cancel payment
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <MarkPaidDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        payment={payment}
        scope={scope}
        onSuccess={onSuccess}
      />
      <CancelPaymentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        payment={payment}
        scope={scope}
        onSuccess={onSuccess}
      />
    </>
  );
}
