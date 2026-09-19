import { describe, expect, it } from "vitest";

import {
  EMPTY_PAYMENT_SCOPE,
  canActOnPayment,
  paymentInScope,
  type PaymentScope,
} from "@/lib/payments/scope";

const fee = (memberId: string | null) =>
  ({ type: "membership_fee", memberId, eventId: null }) as const;
const eventRow = (eventId: string | null, memberId: string | null) =>
  ({ type: "event", memberId, eventId }) as const;

describe("paymentInScope", () => {
  it("full scope admits everything", () => {
    expect(paymentInScope("full", fee("m1"))).toBe(true);
    expect(paymentInScope("full", eventRow("e1", null))).toBe(true);
  });

  it("an empty allowlist means nothing, never 'no filter'", () => {
    expect(paymentInScope(EMPTY_PAYMENT_SCOPE, fee("m1"))).toBe(false);
    expect(paymentInScope(EMPTY_PAYMENT_SCOPE, eventRow("e1", "m1"))).toBe(false);
  });

  it("membership fees are reached through the member only", () => {
    const scope: PaymentScope = { memberIds: ["m1"], eventIds: ["e1"] };
    expect(paymentInScope(scope, fee("m1"))).toBe(true);
    expect(paymentInScope(scope, fee("m2"))).toBe(false);
    expect(paymentInScope(scope, fee(null))).toBe(false);
  });

  it("event payments are reached through the event or the responder", () => {
    const scope: PaymentScope = { memberIds: ["m1"], eventIds: ["e1"] };
    // managed event, guest responder (no member)
    expect(paymentInScope(scope, eventRow("e1", null))).toBe(true);
    // unmanaged event, but the responder is a scoped member
    expect(paymentInScope(scope, eventRow("e2", "m1"))).toBe(true);
    // neither
    expect(paymentInScope(scope, eventRow("e2", "m2"))).toBe(false);
    expect(paymentInScope(scope, eventRow(null, null))).toBe(false);
  });

});

describe("canActOnPayment", () => {
  const scope: PaymentScope = { memberIds: ["m1"], eventIds: ["e1"] };

  it("full scope acts on everything", () => {
    expect(canActOnPayment("full", eventRow("e9", null))).toBe(true);
  });

  it("membership fees follow the member, like visibility", () => {
    expect(canActOnPayment(scope, fee("m1"))).toBe(true);
    expect(canActOnPayment(scope, fee("m2"))).toBe(false);
  });

  it("event payments are acted on through the event only", () => {
    expect(canActOnPayment(scope, eventRow("e1", null))).toBe(true);
    // visible through the member, but not actionable
    expect(paymentInScope(scope, eventRow("e2", "m1"))).toBe(true);
    expect(canActOnPayment(scope, eventRow("e2", "m1"))).toBe(false);
    expect(canActOnPayment(EMPTY_PAYMENT_SCOPE, eventRow("e1", "m1"))).toBe(false);
  });
});
