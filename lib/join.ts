import { z } from "zod";

import { memberCustomFieldAnswersSchema } from "@/lib/member-custom-fields";

export const registrationGroupSelectionsSchema = z
  .record(z.string(), z.union([z.string().uuid(), z.literal(""), z.null()]))
  .default({});

export const joinApplicationSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.email("Enter a valid email address."),
  acceptTerms: z
    .boolean()
    .refine((value) => value, "You must accept the organization terms."),
  acceptPrivacy: z
    .boolean()
    .refine((value) => value, "You must accept the privacy policy."),
  registrationGroupSelections: registrationGroupSelectionsSchema,
  customFieldAnswers: memberCustomFieldAnswersSchema.default({}),
});

export const joinPageSettingsSchema = z.object({
  joinPageHeadline: z.string().trim().min(5, "Join page headline is required."),
  joinPageBody: z.string().trim().min(20, "Add a short public introduction for applicants."),
  memberInviteEmailSubject: z
    .string()
    .trim()
    .min(5, "Invite email subject is required."),
  memberInviteEmailBody: z
    .string()
    .trim()
    .min(20, "Add the invite email instructions members should receive after approval."),
  termsOfServiceLabel: z.string().trim().min(5, "Terms label is required."),
  termsOfServiceText: z.string().trim().min(20, "Add the full terms of service text."),
  privacyPolicyLabel: z.string().trim().min(5, "Privacy label is required."),
  privacyPolicyText: z.string().trim().min(20, "Add the full privacy policy text."),
});

export type JoinApplicationInput = z.infer<typeof joinApplicationSchema>;
export type JoinPageSettingsInput = z.infer<typeof joinPageSettingsSchema>;
