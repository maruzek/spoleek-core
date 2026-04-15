import { z } from "zod";

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
