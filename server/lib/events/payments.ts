import { and, eq, ne } from "drizzle-orm";

import {
  planEventPayment,
  resolveEventPaymentDetails,
  type PaymentPlan,
  type PricedEvent,
} from "@/lib/events/payment-plan";
import { db } from "@/server/db";
import {
  EVENT_PAYMENT_PERIOD_KEY_PREFIX,
  eventResponses,
  memberPayments,
  organizations,
  type EventResponse,
} from "@/server/db/schema";
import { EventError } from "@/server/lib/events/errors";
import { generateVariableSymbol } from "@/server/lib/payment-lifecycle";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What `syncEventPayment` needs from the event beyond the pricing slice. */
export type SyncEvent = PricedEvent & { id: string; orgId: string };

export type SyncResponse = Pick<
  EventResponse,
  "id" | "memberId" | "answer" | "standing" | "guestCount"
>;

export type SyncResult = { plan: PaymentPlan; paymentId: string | null };

/**
 * The single write path for event payments.
 *
 * Loads the live row for the response under `FOR UPDATE`, asks
 * `planEventPayment` what to do and applies it. Always inside the caller's
 * transaction: if this throws, the RSVP that triggered it rolls back too, so
 * a confirmed yes on a priced event never exists without its payment.
 *
 * `response` is `null` when the row was just deleted; the live payment is
 * then found by `responseId` before the FK sets it null — callers delete
 * *after* the sync.
 */
export async function syncEventPayment(
  tx: Tx,
  params: {
    orgId: string;
    event: SyncEvent;
    response: SyncResponse | null;
    responseId: string;
    now?: Date;
  },
): Promise<SyncResult> {
  const now = params.now ?? new Date();

  const [current] = await tx
    .select({
      id: memberPayments.id,
      status: memberPayments.status,
      amount: memberPayments.amount,
    })
    .from(memberPayments)
    .where(
      and(
        eq(memberPayments.orgId, params.orgId),
        eq(memberPayments.responseId, params.responseId),
        ne(memberPayments.status, "cancelled"),
      ),
    )
    .for("update")
    .limit(1);

  const plan = planEventPayment({
    event: params.event,
    response: params.response,
    current: current ?? null,
  });

  switch (plan.kind) {
    case "noop":
      return { plan, paymentId: current?.id ?? null };

    case "create": {
      const [org] = await tx
        .select({ bankAccount: organizations.membershipFeeBankAccount })
        .from(organizations)
        .where(eq(organizations.id, params.orgId))
        .limit(1);

      const details = resolveEventPaymentDetails({
        event: params.event,
        orgBankAccount: org?.bankAccount ?? null,
        now,
      });

      // Only reachable when the organization's account was removed after the
      // event was published; rolling the RSVP back beats issuing a payment
      // nobody can pay.
      if (!details.bankAccount) throw new EventError("PAYMENT_BANK_ACCOUNT_MISSING");

      const [created] = await tx
        .insert(memberPayments)
        .values({
          orgId: params.orgId,
          memberId: params.response?.memberId ?? null,
          eventId: params.event.id,
          responseId: params.responseId,
          type: "event",
          status: "pending",
          amount: plan.amount,
          currency: params.event.priceCurrency!,
          bankAccount: details.bankAccount,
          periodLabel: params.event.title,
          periodKey: EVENT_PAYMENT_PERIOD_KEY_PREFIX + params.event.id,
          variableSymbol: await generateVariableSymbol(params.orgId, tx),
          dueAt: details.dueAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: memberPayments.id });

      return { plan, paymentId: created!.id };
    }

    case "reprice":
      await tx
        .update(memberPayments)
        .set({ amount: plan.amount, updatedAt: now })
        .where(eq(memberPayments.id, current!.id));
      return { plan, paymentId: current!.id };

    case "cancel":
      await tx
        .update(memberPayments)
        .set({
          status: "cancelled",
          cancellationReason: "rsvp_withdrawn",
          updatedAt: now,
        })
        .where(eq(memberPayments.id, current!.id));
      return { plan, paymentId: current!.id };

    case "refund_due":
      await tx
        .update(memberPayments)
        .set({ status: "refund_due", updatedAt: now })
        .where(eq(memberPayments.id, current!.id));
      return { plan, paymentId: current!.id };
  }
}

export type SyncEventSummary = {
  created: number;
  repriced: number;
  cancelled: number;
  /** Rows a payment email should go out for (created or re-priced). */
  notifyPaymentIds: string[];
};

/**
 * Re-syncs every yes on the event after its price changed. Pending rows are
 * re-priced, missing ones created, paid ones untouched; a removed price
 * cancels what is still pending.
 */
export async function syncEventPaymentsForEvent(
  tx: Tx,
  params: { orgId: string; event: SyncEvent; now?: Date },
): Promise<SyncEventSummary> {
  const summary: SyncEventSummary = {
    created: 0,
    repriced: 0,
    cancelled: 0,
    notifyPaymentIds: [],
  };

  const responses = await tx
    .select({
      id: eventResponses.id,
      memberId: eventResponses.memberId,
      answer: eventResponses.answer,
      standing: eventResponses.standing,
      guestCount: eventResponses.guestCount,
    })
    .from(eventResponses)
    .where(
      and(
        eq(eventResponses.orgId, params.orgId),
        eq(eventResponses.eventId, params.event.id),
        eq(eventResponses.answer, "yes"),
      ),
    );

  for (const response of responses) {
    const { plan, paymentId } = await syncEventPayment(tx, {
      orgId: params.orgId,
      event: params.event,
      response,
      responseId: response.id,
      now: params.now,
    });

    if (plan.kind === "create") summary.created += 1;
    if (plan.kind === "reprice") summary.repriced += 1;
    if (plan.kind === "cancel") summary.cancelled += 1;
    if ((plan.kind === "create" || plan.kind === "reprice") && paymentId) {
      summary.notifyPaymentIds.push(paymentId);
    }
  }

  return summary;
}
