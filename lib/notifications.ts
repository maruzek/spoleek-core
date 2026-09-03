import { z } from "zod";

/**
 * An optional extra address on a notification setting (a shared committee
 * mailbox, a Google group). Empty input means "not set", never an empty string,
 * so the recipient resolver can treat `null` as the single absent case.
 */
export const optionalNotificationEmailSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
  .refine(
    (value) => value.length === 0 || z.email().safeParse(value).success,
    { message: "Enter a valid email address." },
  )
  .transform((value) => (value.length > 0 ? value : null));
