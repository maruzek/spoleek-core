import { describe, expect, it } from "vitest";

import { buildSpdString, paymentQrPayerName } from "@/lib/payments";
import {
  buildPaymentQrUrl,
  signPaymentQrToken,
  verifyPaymentQrToken,
} from "@/server/lib/payment-qr";

/**
 * The QR endpoint is unauthenticated by necessity — a mail client fetches it
 * with no session — so the token is the only thing standing between a stranger
 * and a member's name and bank details. It used to have no expiry at all, which
 * made every payment email a permanent handle on that data.
 */
const PAYMENT_ID = "4f1c0f0e-1c2b-4f3a-9d5e-6a7b8c9d0e1f";

function inDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe("the payment QR token", () => {
  it("round-trips the payment id while the token is live", () => {
    const token = signPaymentQrToken(PAYMENT_ID, inDays(30));

    expect(verifyPaymentQrToken(token)).toBe(PAYMENT_ID);
  });

  it("refuses a token past its expiry", () => {
    const token = signPaymentQrToken(PAYMENT_ID, inDays(-1));

    expect(verifyPaymentQrToken(token)).toBeNull();
  });

  it("refuses a token whose expiry has been edited", () => {
    const token = signPaymentQrToken(PAYMENT_ID, inDays(-1));
    const [id, , signature] = token.split(".");
    const extended = Math.floor(inDays(365).getTime() / 1000).toString(36);

    // The expiry is inside the signed payload, so moving it invalidates it
    // rather than buying another year.
    expect(verifyPaymentQrToken(`${id}.${extended}.${signature}`)).toBeNull();
  });

  it("refuses a tampered payment id", () => {
    const token = signPaymentQrToken(PAYMENT_ID, inDays(30));
    const [, expiry, signature] = token.split(".");
    const otherId = Buffer.from("11111111-2222-3333-4444-555555555555").toString(
      "base64url",
    );

    expect(verifyPaymentQrToken(`${otherId}.${expiry}.${signature}`)).toBeNull();
  });

  it("refuses malformed tokens, including the old two-part shape", () => {
    const legacy = "abc.def";

    expect(verifyPaymentQrToken(legacy)).toBeNull();
    expect(verifyPaymentQrToken("")).toBeNull();
    expect(verifyPaymentQrToken("only-one-part")).toBeNull();
  });

  it("builds an absolute URL without a doubled slash", () => {
    const url = buildPaymentQrUrl(PAYMENT_ID, inDays(30));

    expect(url).toMatch(/^https?:\/\/[^/]+\/api\/payments\/qr\/[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});

describe("the payer name on a payment QR", () => {
  const payment = {
    bankAccount: "CZ6508000000192000145399",
    amount: 35_000,
    currency: "CZK",
    periodLabel: "Summer camp",
    variableSymbol: "123456",
  };

  it("uses the member's name when the payment has a member", () => {
    const name = paymentQrPayerName({
      firstName: "Alex",
      lastName: "Member",
      guestName: null,
    });

    expect(name).toBe("Alex Member");
    expect(buildSpdString(payment, name)).toContain("MSG:Alex Member Summer camp");
  });

  it("falls back to the guest name from the RSVP", () => {
    const name = paymentQrPayerName({
      firstName: null,
      lastName: null,
      guestName: "Guest Person",
    });

    expect(name).toBe("Guest Person");
    expect(buildSpdString(payment, name)).toContain("MSG:Guest Person Summer camp");
  });

  it("renders a shredded guest without a name, keeping the variable symbol", () => {
    const name = paymentQrPayerName({ firstName: null, lastName: null, guestName: null });

    expect(name).toBeUndefined();
    const spd = buildSpdString(payment, name);
    expect(spd).toContain("MSG:Summer camp");
    expect(spd).toContain("X-VS:123456");
  });
});
