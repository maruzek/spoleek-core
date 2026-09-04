import type { MemberPayment } from "@/server/db/schema";

/**
 * The shape every shared payment component works with. The payments dashboard
 * joins the member in already (`PaymentRow`); the member detail page attaches
 * the name it already has. Keeping one type means a dialog opened from either
 * surface renders and acts identically.
 */
export type PaymentWithMember = MemberPayment & {
  memberName: string;
};
