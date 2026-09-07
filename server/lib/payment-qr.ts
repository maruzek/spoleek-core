import { createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env";

/**
 * Email clients strip inline SVG, so the payment QR in emails is served as a
 * PNG from our own domain rather than reusing the portal's <QRCode> component
 * or a third-party image service (which would leak the IBAN and amount).
 *
 * The URL carries an HMAC-signed payment id instead of the payment id itself:
 * the endpoint is public by necessity (the recipient's mail client fetches it
 * unauthenticated), so an unsigned id would let anyone enumerate other members'
 * bank details.
 *
 * The signature covers an expiry as well as the id. Without one the URL is a
 * permanent, unauthenticated handle on a member's name and payment details for
 * anyone who ever receives, forwards or archives the email — and a mailing list
 * archive keeps it reachable long after the payment is settled.
 */

/**
 * How long past the due date a QR stays live.
 *
 * Generous on purpose: a member paying two months late should still be able to
 * scan the code in the original email, and an expired QR that was legitimately
 * needed is a support ticket. It is a bound on how long the handle survives,
 * not a payment deadline — `dueAt` is the deadline.
 */
export const PAYMENT_QR_GRACE_DAYS = 90;

function sign(payload: string): string {
  const { APP_ENCRYPTION_KEY } = getServerEnv();
  return createHmac("sha256", APP_ENCRYPTION_KEY)
    .update(`payment-qr:${payload}`)
    .digest("base64url");
}

export function signPaymentQrToken(paymentId: string, expiresAt: Date): string {
  const id = Buffer.from(paymentId, "utf8").toString("base64url");
  // Whole seconds: a token is compared against a clock, not replayed exactly.
  const expiry = Math.floor(expiresAt.getTime() / 1000).toString(36);
  const payload = `${id}.${expiry}`;

  return `${payload}.${sign(payload)}`;
}

export function verifyPaymentQrToken(token: string, now = new Date()): string | null {
  const [id, expiry, signature] = token.split(".");

  if (!id || !expiry || !signature) return null;

  const expected = Buffer.from(sign(`${id}.${expiry}`));
  const provided = Buffer.from(signature);

  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  // Checked only after the signature, so an unsigned guess learns nothing about
  // whether a payment exists or when it was issued.
  const expiresAtMs = Number.parseInt(expiry, 36) * 1000;

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) return null;

  return Buffer.from(id, "base64url").toString("utf8");
}

/** Absolute URL for the payment QR PNG — emails cannot use relative sources. */
export function buildPaymentQrUrl(paymentId: string, expiresAt: Date): string {
  const { APP_URL } = getServerEnv();
  const token = signPaymentQrToken(paymentId, expiresAt);

  return `${APP_URL.replace(/\/$/, "")}/api/payments/qr/${token}`;
}
