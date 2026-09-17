import { describe, expect, it } from "vitest";

import {
  EVENT_PAYMENT_DEFAULT_DUE_DAYS,
  eventPaymentAmount,
  isLivePayment,
  planEventPayment,
  resolveEventPaymentDetails,
  type LivePayment,
  type PlanResponse,
  type PricedEvent,
} from "@/lib/events/payment-plan";
import { eventInputSchema } from "@/lib/events/schemas";

const now = new Date("2026-09-16T12:00:00Z");
const deadline = new Date("2026-10-01T12:00:00Z");
const start = new Date("2026-10-10T08:00:00Z");
const dueDate = new Date("2026-09-25T00:00:00Z");

const priced = (overrides: Partial<PricedEvent> = {}): PricedEvent => ({
  title: "Summer camp",
  priceAmount: 35_000,
  priceCurrency: "CZK",
  priceBankAccount: null,
  paymentDueAt: null,
  rsvpDeadlineAt: null,
  startsAt: null,
  ...overrides,
});

const free = (): PricedEvent => priced({ priceAmount: null, priceCurrency: null });

const response = (
  answer: NonNullable<PlanResponse>["answer"],
  standing: NonNullable<PlanResponse>["standing"] = "confirmed",
  guestCount = 0,
): PlanResponse => ({ answer, standing, guestCount });

const confirmedYes = response("yes");
const reserveYes = response("yes", "reserve");

const pending = (amount = 35_000): LivePayment => ({ status: "pending", amount });
const overdue = (amount = 35_000): LivePayment => ({ status: "overdue", amount });
const paid = (amount = 35_000): LivePayment => ({ status: "paid", amount });
const refundDue = (amount = 35_000): LivePayment => ({ status: "refund_due", amount });

describe("isLivePayment", () => {
  it("counts everything but cancelled as live", () => {
    expect(isLivePayment("pending")).toBe(true);
    expect(isLivePayment("overdue")).toBe(true);
    expect(isLivePayment("paid")).toBe(true);
    expect(isLivePayment("refund_due")).toBe(true);
    expect(isLivePayment("cancelled")).toBe(false);
  });
});

describe("eventPaymentAmount", () => {
  it("charges the responder alone with no guests", () => {
    expect(eventPaymentAmount(priced(), { guestCount: 0 })).toBe(35_000);
  });

  it("charges one price per guest on top", () => {
    expect(eventPaymentAmount(priced(), { guestCount: 2 })).toBe(105_000);
  });
});

describe("planEventPayment — confirmed yes on a priced event", () => {
  it("creates a payment when there is no live row", () => {
    expect(
      planEventPayment({ event: priced(), response: confirmedYes, current: null }),
    ).toEqual({ kind: "create", amount: 35_000 });
  });

  it("creates with guests priced in", () => {
    expect(
      planEventPayment({
        event: priced(),
        response: response("yes", "confirmed", 2),
        current: null,
      }),
    ).toEqual({ kind: "create", amount: 105_000 });
  });

  it("re-prices a pending row when the amount changed", () => {
    expect(
      planEventPayment({
        event: priced(),
        response: response("yes", "confirmed", 1),
        current: pending(35_000),
      }),
    ).toEqual({ kind: "reprice", amount: 70_000 });
  });

  it("re-prices an overdue row too", () => {
    expect(
      planEventPayment({
        event: priced({ priceAmount: 40_000 }),
        response: confirmedYes,
        current: overdue(35_000),
      }),
    ).toEqual({ kind: "reprice", amount: 40_000 });
  });

  it("does nothing when a pending row already carries the right amount", () => {
    expect(
      planEventPayment({ event: priced(), response: confirmedYes, current: pending() }),
    ).toEqual({ kind: "noop" });
  });

  it("leaves a paid row alone even when the amount would differ", () => {
    expect(
      planEventPayment({
        event: priced(),
        response: response("yes", "confirmed", 3),
        current: paid(35_000),
      }),
    ).toEqual({ kind: "noop" });
  });

  it("leaves a refund_due row alone when the yes comes back", () => {
    expect(
      planEventPayment({ event: priced(), response: confirmedYes, current: refundDue() }),
    ).toEqual({ kind: "noop" });
  });
});

describe("planEventPayment — yes on the reserve list", () => {
  it("charges nothing until promoted", () => {
    expect(
      planEventPayment({ event: priced(), response: reserveYes, current: null }),
    ).toEqual({ kind: "noop" });
  });

  it("cancels a pending row on demotion", () => {
    expect(
      planEventPayment({ event: priced(), response: reserveYes, current: pending() }),
    ).toEqual({ kind: "cancel" });
  });

  it("flags a paid row for refund on demotion", () => {
    expect(
      planEventPayment({ event: priced(), response: reserveYes, current: paid() }),
    ).toEqual({ kind: "refund_due" });
  });
});

describe("planEventPayment — no / maybe", () => {
  it.each(["no", "maybe"] as const)("%s with no row is a noop", (answer) => {
    expect(
      planEventPayment({ event: priced(), response: response(answer), current: null }),
    ).toEqual({ kind: "noop" });
  });

  it.each(["no", "maybe"] as const)("%s cancels a pending row", (answer) => {
    expect(
      planEventPayment({ event: priced(), response: response(answer), current: pending() }),
    ).toEqual({ kind: "cancel" });
  });

  it("cancels an overdue row as well", () => {
    expect(
      planEventPayment({ event: priced(), response: response("no"), current: overdue() }),
    ).toEqual({ kind: "cancel" });
  });

  it.each(["no", "maybe"] as const)("%s flags a paid row for refund", (answer) => {
    expect(
      planEventPayment({ event: priced(), response: response(answer), current: paid() }),
    ).toEqual({ kind: "refund_due" });
  });

  it("never re-flags a row that is already refund_due", () => {
    expect(
      planEventPayment({ event: priced(), response: response("no"), current: refundDue() }),
    ).toEqual({ kind: "noop" });
  });
});

describe("planEventPayment — response deleted", () => {
  it("is a noop with no row", () => {
    expect(planEventPayment({ event: priced(), response: null, current: null })).toEqual({
      kind: "noop",
    });
  });

  it("cancels a pending row", () => {
    expect(
      planEventPayment({ event: priced(), response: null, current: pending() }),
    ).toEqual({ kind: "cancel" });
  });

  it("flags a paid row for refund", () => {
    expect(planEventPayment({ event: priced(), response: null, current: paid() })).toEqual({
      kind: "refund_due",
    });
  });
});

describe("planEventPayment — event unpriced or price removed", () => {
  it("never creates a payment on a free event", () => {
    expect(
      planEventPayment({ event: free(), response: confirmedYes, current: null }),
    ).toEqual({ kind: "noop" });
  });

  it("cancels a pending row when the price is removed", () => {
    expect(
      planEventPayment({ event: free(), response: confirmedYes, current: pending() }),
    ).toEqual({ kind: "cancel" });
  });

  it("keeps a paid row when the price is removed", () => {
    expect(
      planEventPayment({ event: free(), response: confirmedYes, current: paid() }),
    ).toEqual({ kind: "noop" });
  });

  it("keeps a refund_due row when the price is removed", () => {
    expect(
      planEventPayment({ event: free(), response: response("no"), current: refundDue() }),
    ).toEqual({ kind: "noop" });
  });
});

describe("resolveEventPaymentDetails", () => {
  it("prefers the event's own bank account", () => {
    const details = resolveEventPaymentDetails({
      event: priced({ priceBankAccount: "CZ11" }),
      orgBankAccount: "CZ22",
      now,
    });
    expect(details.bankAccount).toBe("CZ11");
  });

  it("falls back to the organization's account, then to none", () => {
    expect(
      resolveEventPaymentDetails({ event: priced(), orgBankAccount: "CZ22", now }).bankAccount,
    ).toBe("CZ22");
    expect(
      resolveEventPaymentDetails({ event: priced(), orgBankAccount: null, now }).bankAccount,
    ).toBeNull();
  });

  it("walks the due date chain: due → deadline → start → now + 14 days", () => {
    const all = priced({ paymentDueAt: dueDate, rsvpDeadlineAt: deadline, startsAt: start });
    expect(resolveEventPaymentDetails({ event: all, orgBankAccount: null, now }).dueAt).toEqual(
      dueDate,
    );

    const noDue = priced({ rsvpDeadlineAt: deadline, startsAt: start });
    expect(resolveEventPaymentDetails({ event: noDue, orgBankAccount: null, now }).dueAt).toEqual(
      deadline,
    );

    const onlyStart = priced({ startsAt: start });
    expect(
      resolveEventPaymentDetails({ event: onlyStart, orgBankAccount: null, now }).dueAt,
    ).toEqual(start);

    const nothing = priced();
    expect(
      resolveEventPaymentDetails({ event: nothing, orgBankAccount: null, now }).dueAt,
    ).toEqual(new Date(now.getTime() + EVENT_PAYMENT_DEFAULT_DUE_DAYS * 86_400_000));
  });
});

describe("eventInputSchema — payment fields", () => {
  const base = {
    title: "Summer camp",
    slug: "summer-camp",
    ownerType: "organization" as const,
    visibility: "org" as const,
  };

  it("accepts a free event with the price fields absent", () => {
    const parsed = eventInputSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.paid).toBe(false);
  });

  it("requires amount and currency once the event is paid", () => {
    const parsed = eventInputSchema.safeParse({ ...base, paid: true });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("priceAmount");
      expect(paths).toContain("priceCurrency");
    }
  });

  it("accepts a two-decimal major-unit price and normalises the currency", () => {
    const parsed = eventInputSchema.safeParse({
      ...base,
      paid: true,
      priceAmount: 350.5,
      priceCurrency: "czk",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.priceCurrency).toBe("CZK");
  });

  it("rejects more than two decimals and non-positive prices", () => {
    expect(
      eventInputSchema.safeParse({ ...base, paid: true, priceAmount: 1.005, priceCurrency: "CZK" })
        .success,
    ).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...base, paid: true, priceAmount: 0, priceCurrency: "CZK" })
        .success,
    ).toBe(false);
  });
});
