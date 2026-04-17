import { Resend } from "resend";

import { getServerEnv } from "@/lib/env";

let cachedResend: Resend | null = null;

export function getResendClient() {
  if (cachedResend) {
    return cachedResend;
  }

  const env = getServerEnv();

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send member invite emails.");
  }

  cachedResend = new Resend(env.RESEND_API_KEY);
  return cachedResend;
}

export function getResendFromEmail() {
  const env = getServerEnv();
  const from = env.RESEND_FROM_EMAIL ?? env.SMTP_FROM;

  if (!from) {
    throw new Error(
      "RESEND_FROM_EMAIL or SMTP_FROM is required to send member invite emails.",
    );
  }

  return from;
}
