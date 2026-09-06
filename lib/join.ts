import { z } from "zod";

import { getDictionary } from "@/lib/i18n";
import { memberCustomFieldAnswersSchema } from "@/lib/member-custom-fields";

// Only ever imported from server actions, so reading the server-side locale at
// module scope is safe. joinPageSettingsSchema below is admin-facing and stays
// English on purpose.
const t = getDictionary().errors;

export const registrationGroupSelectionsSchema = z
  .record(z.string(), z.union([z.string().uuid(), z.literal(""), z.null()]))
  .default({});

export const joinApplicationSchema = z.object({
  firstName: z.string().trim().min(1, t.firstNameRequired),
  lastName: z.string().trim().min(1, t.lastNameRequired),
  email: z.email(t.invalidEmail),
  acceptTerms: z
    .boolean()
    .refine((value) => value, t.acceptTerms),
  acceptPrivacy: z
    .boolean()
    .refine((value) => value, t.acceptPrivacy),
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
  // The legal documents moved to their own versioned tables and the Legal
  // settings tab; see docs/legal-policies.md.
});

export type JoinApplicationInput = z.infer<typeof joinApplicationSchema>;
export type JoinPageSettingsInput = z.infer<typeof joinPageSettingsSchema>;
