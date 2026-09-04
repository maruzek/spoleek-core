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
 */
function sign(payload: string): string {
  const { APP_ENCRYPTION_KEY } = getServerEnv();
  return createHmac("sha256", APP_ENCRYPTION_KEY)
    .update(`payment-qr:${payload}`)
    .digest("base64url");
}

export function signPaymentQrToken(paymentId: string): string {
  const payload = Buffer.from(paymentId, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyPaymentQrToken(token: string): string | null {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);

  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  return Buffer.from(payload, "base64url").toString("utf8");
}

/** Absolute URL for the payment QR PNG — emails cannot use relative sources. */
export function buildPaymentQrUrl(paymentId: string): string {
  const { APP_URL } = getServerEnv();
  return `${APP_URL.replace(/\/$/, "")}/api/payments/qr/${signPaymentQrToken(paymentId)}`;
}
