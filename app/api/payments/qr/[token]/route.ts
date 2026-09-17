import { eq } from "drizzle-orm";
import QRCode from "qrcode";

import { buildSpdString, paymentQrPayerName } from "@/lib/payments";
import { db } from "@/server/db";
import { eventResponses, memberPayments, tenantMembers } from "@/server/db/schema";
import { verifyPaymentQrToken } from "@/server/lib/payment-qr";

/**
 * Public QR endpoint for payment emails. Authorisation is the HMAC in the
 * token — a mail client fetches this with no session. Nothing here echoes the
 * payment back as data; the only thing it emits is the PNG.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const paymentId = verifyPaymentQrToken(token);

  if (!paymentId) {
    return new Response("Not found", { status: 404 });
  }

  const [row] = await db
    .select({
      payment: memberPayments,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
      guestName: eventResponses.guestName,
    })
    .from(memberPayments)
    // A guest's event payment has no member; its name sits on the RSVP and is
    // gone after the retention shred, in which case the QR carries no name.
    .leftJoin(tenantMembers, eq(memberPayments.memberId, tenantMembers.id))
    .leftJoin(eventResponses, eq(memberPayments.responseId, eventResponses.id))
    .where(eq(memberPayments.id, paymentId))
    .limit(1);

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const spd = buildSpdString(row.payment, paymentQrPayerName(row));

  if (!spd) {
    return new Response("Not found", { status: 404 });
  }

  const png = await QRCode.toBuffer(spd, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#14231dff", light: "#ffffffff" },
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // The payment details are immutable once issued, but keep it private so
      // shared proxies don't retain another member's payment QR.
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": 'inline; filename="payment-qr.png"',
    },
  });
}
