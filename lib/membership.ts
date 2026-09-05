import { z } from "zod";

import { parseBankAccount } from "@/lib/iban";
import { isMembershipPeriodModeImplemented } from "@/lib/membership-period";
import type { MembershipManagementMode } from "@/server/db/schema";


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

/** February allows 29 so a leap-year date is not rejected outright. */
const MAX_DAYS_IN_MONTH: Record<number, number> = {
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
    membershipFeeBankAccount: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((value) => {
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) return null;
        try {
          return parseBankAccount(trimmed);
        } catch {
          return trimmed;
        }
      }),
    membershipFeePaymentWindowDays: z.number().int().min(1).max(365).default(30),
    membershipPeriodMode: z
      .enum(["calendar_year", "renewal_span"])
      .default("calendar_year"),
    membershipReportEnabled: z.boolean().default(false),
    membershipReportAllowSelfApproval: z.boolean().default(false),
    membershipReportConfirmMonth: z
      .union([z.number().int().min(1).max(12), z.null()])
      .default(null),
    membershipReportConfirmDay: z
      .union([z.number().int().min(1).max(31), z.null()])
      .default(null),
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

      if (
        value.membershipRenewalMonth != null &&
        value.membershipRenewalDay != null &&
        value.membershipRenewalDay >
          (MAX_DAYS_IN_MONTH[value.membershipRenewalMonth] ?? 31)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["membershipRenewalDay"],
          message: `Day ${value.membershipRenewalDay} is not valid for month ${value.membershipRenewalMonth}.`,
        });
      }
    }

    if (!isMembershipPeriodModeImplemented(value.membershipPeriodMode)) {
      ctx.addIssue({
        code: "custom",
        path: ["membershipPeriodMode"],
        message: "That membership period mode is not available yet.",
      });
    }

    // The report counts paid members per group, so both halves have to exist.
    if (
      value.membershipReportEnabled &&
      (value.membershipManagementMode !== "periodic_renewal" ||
        !value.membershipFeeEnabled)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["membershipReportEnabled"],
        message:
          "The yearly report needs periodic renewal with fee payment enabled.",
      });
    }

    // Both halves of the deadline or neither — a month with no day is not a date.
    if (
      (value.membershipReportConfirmMonth == null) !==
      (value.membershipReportConfirmDay == null)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["membershipReportConfirmDay"],
        message: "Set both a month and a day for the confirmation deadline.",
      });
    }

    if (
      value.membershipReportConfirmMonth != null &&
      value.membershipReportConfirmDay != null &&
      value.membershipReportConfirmDay >
        (MAX_DAYS_IN_MONTH[value.membershipReportConfirmMonth] ?? 31)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["membershipReportConfirmDay"],
        message: `Day ${value.membershipReportConfirmDay} is not valid for month ${value.membershipReportConfirmMonth}.`,
      });
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
      try {
        parseBankAccount(value.membershipFeeBankAccount);
      } catch (e) {
        ctx.addIssue({
          code: "custom",
          path: ["membershipFeeBankAccount"],
          message: e instanceof Error ? e.message : "Invalid bank account.",
        });
      }
    }
  });

export type MembershipSettingsFormValues = z.infer<
  typeof membershipSettingsSchema
>;
