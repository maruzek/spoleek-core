import { z } from "zod";

import type { MembershipManagementMode } from "@/server/db/schema";

const nullableTrimmedString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  });

export const membershipManagementModeOptions: Array<{
  value: MembershipManagementMode;
  label: string;
  description: string;
}> = [
  {
    value: "none",
    label: "No management",
    description:
      "Members stay active indefinitely. No renewal or confirmation required.",
  },
  {
    value: "periodic_renewal",
    label: "Periodic renewal",
    description:
      "Members must confirm their membership each year during the renewal period.",
  },
];

export const feeCurrencyOptions: Array<{ value: string; label: string }> = [
  { value: "CZK", label: "CZK" },
  { value: "EUR", label: "EUR" },
  { value: "USD", label: "USD" },
];

export const membershipSettingsSchema = z
  .object({
    membershipManagementMode: z.enum(["none", "periodic_renewal"]),
    membershipRenewalMonth: z
      .union([z.number().int().min(1).max(12), z.null()])
      .default(null),
    membershipRenewalDay: z
      .union([z.number().int().min(1).max(31), z.null()])
      .default(null),
    membershipFeeEnabled: z.boolean().default(false),
    membershipFeeAmount: z
      .union([z.number().int().min(0), z.null()])
      .default(null),
    membershipFeeCurrency: z.string().trim().default("CZK"),
    membershipFeeBankAccount: nullableTrimmedString,
    membershipFeePaymentWindowDays: z.number().int().min(1).max(365).default(30),
  })
  .superRefine((value, ctx) => {
    if (value.membershipManagementMode === "periodic_renewal") {
      if (value.membershipRenewalMonth == null) {
        ctx.addIssue({
          code: "custom",
          path: ["membershipRenewalMonth"],
          message: "Renewal month is required for periodic renewal.",
        });
      }
      if (value.membershipRenewalDay == null) {
        ctx.addIssue({
          code: "custom",
          path: ["membershipRenewalDay"],
          message: "Renewal day is required for periodic renewal.",
        });
      }

      const maxDays: Record<number, number> = {
        1: 31,
        2: 29,
        3: 31,
        4: 30,
        5: 31,
        6: 30,
        7: 31,
        8: 31,
        9: 30,
        10: 31,
        11: 30,
        12: 31,
      };
      if (
        value.membershipRenewalMonth != null &&
        value.membershipRenewalDay != null &&
        value.membershipRenewalDay > (maxDays[value.membershipRenewalMonth] ?? 31)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["membershipRenewalDay"],
          message: `Day ${value.membershipRenewalDay} is not valid for month ${value.membershipRenewalMonth}.`,
        });
      }
    }

    if (value.membershipFeeEnabled) {
      if (value.membershipFeeAmount == null) {
        ctx.addIssue({
          code: "custom",
          path: ["membershipFeeAmount"],
          message: "Fee amount is required when fee payment is enabled.",
        });
      }
    }

    if (value.membershipFeeBankAccount != null) {
      const iban = value.membershipFeeBankAccount.replace(/\s/g, "").toUpperCase();
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(iban)) {
        ctx.addIssue({
          code: "custom",
          path: ["membershipFeeBankAccount"],
          message: "Enter a valid IBAN (e.g. CZ6508000000192000145399).",
        });
      }
    }
  });

export type MembershipSettingsFormValues = z.infer<
  typeof membershipSettingsSchema
>;
