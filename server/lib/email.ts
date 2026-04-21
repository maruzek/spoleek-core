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
  //todo: import name from .env
  return `Karel Botenberg<${from}>`;
}

export function getResendWebhookSecret() {
  const env = getServerEnv();

  if (!env.RESEND_WEBHOOK_SECRET) {
    throw new Error(
      "RESEND_WEBHOOK_SECRET is required to verify Resend webhook events.",
    );
  }

  return env.RESEND_WEBHOOK_SECRET;
}
