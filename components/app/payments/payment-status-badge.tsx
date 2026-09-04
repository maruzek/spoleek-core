import { Badge } from "@/components/ui/badge";
import type { MemberPaymentStatus } from "@/server/db/schema";

const STATUS_VARIANTS: Record<
  MemberPaymentStatus,
  "destructive" | "secondary" | "default" | "outline"
> = {
  overdue: "destructive",
  pending: "secondary",
  paid: "default",
  cancelled: "outline",
};

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
  const variant =
    emphasizeUnpaid && status === "pending"
      ? "destructive"
      : STATUS_VARIANTS[status];

  return (
    <Badge variant={variant} className={className}>
      {status}
    </Badge>
  );
}
