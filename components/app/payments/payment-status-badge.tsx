import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import type { StatusDotVariant } from "@/lib/status-dot";
import { cn } from "@/lib/utils";
import type { MemberPaymentStatus } from "@/server/db/schema";

/** `Status` variant per payment status — the same dot badge events, forms and members use. */
export const paymentStatusDotVariant: Record<MemberPaymentStatus, StatusDotVariant> = {
  paid: "success",
  pending: "info",
  overdue: "error",
  refund_due: "warning",
  cancelled: "default",
};

export const paymentStatusLabel: Record<MemberPaymentStatus, string> = {
  paid: "Paid",
  pending: "Pending",
  overdue: "Overdue",
  refund_due: "Refund due",
  cancelled: "Cancelled",
};

export function PaymentStatusBadge({
  status,
  className,
  emphasizeUnpaid = false,
}: {
  status: MemberPaymentStatus;
  className?: string;
  /**
   * Render "pending" as an error too. On one member's record every unpaid
   * fee is something to act on, so both owed states read red; the org-wide
   * dashboard leaves it off, where a column of red pendings would be noise.
   */
  emphasizeUnpaid?: boolean;
}) {
  const variant = emphasizeUnpaid && status === "pending" ? "error" : paymentStatusDotVariant[status];

  return (
    <Status variant={variant} className={cn(className)}>
      <StatusIndicator />
      <StatusLabel>{paymentStatusLabel[status]}</StatusLabel>
    </Status>
  );
}
