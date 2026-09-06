import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PAYMENT_STATUS_COLORS } from "@/lib/payments";
import type { MemberPaymentStatus } from "@/server/db/schema";

export function PaymentStatusBadge({
  status,
  className,
  emphasizeUnpaid = false,
}: {
  status: MemberPaymentStatus;
  className?: string;
  /**
   * Render "pending" as destructive too. On one member's record every unpaid
   * fee is something to act on, so both owed states read red; the org-wide
   * dashboard leaves it off, where a column of red pendings would be noise.
   */
  emphasizeUnpaid?: boolean;
}) {
  // The badge carries its own tint, so it always renders on the neutral
  // `outline` base rather than one of the themed variants.
  const tint =
    emphasizeUnpaid && status === "pending"
      ? PAYMENT_STATUS_COLORS.overdue.badge
      : PAYMENT_STATUS_COLORS[status].badge;

  return (
    <Badge variant="outline" className={cn("capitalize", tint, className)}>
      {status}
    </Badge>
  );
}
