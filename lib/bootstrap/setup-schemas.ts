import { z } from "zod";

import { parseBankAccount } from "@/lib/iban";

export const emailAdminSchema = z.object({
  name: z.string().min(2, "Admin name is required."),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const organizationBootstrapSchema = z.object({
  organizationName: z.string().min(2, "Organization name is required."),
  organizationSlug: z
    .string()
    .min(2, "Slug is required.")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens.",
    ),
  legalName: z.string().min(2, "Legal name is required."),
  primaryEmail: z.email("Enter a valid organization email."),
  website: z
    .union([z.literal(""), z.url("Enter a valid website URL.")])
    .optional(),
});

export type EmailAdminValues = z.infer<typeof emailAdminSchema>;
export type OrganizationBootstrapValues = z.infer<
  typeof organizationBootstrapSchema
>;

export const organizationBootstrapWithMembershipSchema =
  organizationBootstrapSchema
    .extend({
      membershipManagementMode: z
        .enum(["none", "periodic_renewal"])
        .default("none"),
      membershipRenewalMonth: z
        .union([z.number().int().min(1).max(12), z.null()])
        .default(null),
      membershipRenewalDay: z
        .union([z.number().int().min(1).max(31), z.null()])
        .default(null),
      membershipFeeEnabled: z.boolean().default(false),
      membershipFeeAmount: z
        .union([z.number().min(0), z.null()])
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
      membershipFeePaymentWindowDays: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30),
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
          1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
          7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31,
        };
        if (
          value.membershipRenewalMonth != null &&
          value.membershipRenewalDay != null &&
          value.membershipRenewalDay >
            (maxDays[value.membershipRenewalMonth] ?? 31)
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
        try {
          parseBankAccount(value.membershipFeeBankAccount);
        } catch (e) {
          ctx.addIssue({
            code: "custom",
            path: ["membershipFeeBankAccount"],
            message:
              e instanceof Error ? e.message : "Invalid bank account.",
          });
        }
      }
    });

export type OrganizationBootstrapWithMembershipValues = z.infer<
  typeof organizationBootstrapWithMembershipSchema
>;
