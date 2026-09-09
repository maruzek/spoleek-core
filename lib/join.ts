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
  /**
   * Version ids the applicant ticked. The set of documents is whatever the org
   * has published, so this replaces the two hardcoded booleans; the action
   * recomputes what is actually required rather than trusting the client.
   */
  acknowledgedPolicyVersionIds: z.array(z.uuid()).default([]),
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
  /**
   * Below this age an application is flagged for manual handling. Empty means
   * the organization has not set one and nothing is flagged.
   *
   * A flag, never a rejection: a youth organization wants the young applicant
   * to reach a human with a guardian countersignature, not to be turned away by
   * a form. The hard bound, if one is wanted, is a date field's `minAge`
   * constraint.
   */
  registrationMinimumAge: z
    .union([z.coerce.number().int().min(0).max(150), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  /**
   * The age at which membership ends — the ending age, not the last age at
   * which somebody may be a member. "Ends on the 36th birthday" is 36 here.
   */
  membershipEndsAtAge: z
    .union([z.coerce.number().int().min(0).max(150), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  maximumAgeEffect: z.enum(["period_end", "birthday"]).default("period_end"),
  // The legal documents moved to their own versioned tables and the Legal
  // settings tab; see docs/legal-policies.md.
}).superRefine((value, ctx) => {
  // Mirrors the database constraint. A window that excludes everybody is a
  // configuration mistake, and finding out through a check violation is a
  // worse way to learn it than a field error.
  if (
    value.registrationMinimumAge != null &&
    value.membershipEndsAtAge != null &&
    value.registrationMinimumAge >= value.membershipEndsAtAge
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["membershipEndsAtAge"],
      message: "Membership cannot end at or below the minimum age.",
    });
  }
});

export type JoinApplicationInput = z.infer<typeof joinApplicationSchema>;
export type JoinPageSettingsInput = z.infer<typeof joinPageSettingsSchema>;
