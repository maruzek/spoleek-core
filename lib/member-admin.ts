import { z } from "zod";

import { memberCustomFieldAnswersSchema } from "@/lib/member-custom-fields";

const tenantRoleSchema = z.enum(["member", "leader", "org_admin"]);
const membershipStatusSchema = z.enum([
  "invited",
  "pending",
  "active",
  "suspended",
  "archived",
]);

const emailSchema = z
  .union([z.literal(""), z.email("Enter a valid email.")])
  .default("");

export const adminMemberIdentitySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: emailSchema,
  role: tenantRoleSchema.default("member"),
  status: membershipStatusSchema.default("active"),
  groupIds: z.array(z.uuid()).default([]),
});

/**
 * Workspace account details the admin confirmed in the provisioning dialog.
 * Provisioning is always a separate step from creating or approving a member,
 * so skipping it is a supported outcome rather than a failure.
 */
export const workspaceProvisionInputSchema = z.object({
  primaryEmail: z.email(),
  extraFields: z
    .record(z.string(), z.union([z.string(), z.boolean()]))
    .optional(),
});

export const createMemberSchema = adminMemberIdentitySchema.extend({
  customFieldAnswers: memberCustomFieldAnswersSchema.default({}),
});

export const provisionMemberWorkspaceAccountSchema =
  workspaceProvisionInputSchema.extend({
    memberId: z.uuid(),
  });

export const updateMemberSchema = adminMemberIdentitySchema.extend({
  memberId: z.uuid(),
  customFieldAnswers: memberCustomFieldAnswersSchema.default({}),
});

export const deleteMemberSchema = z.object({
  memberId: z.uuid(),
});

export const restoreMemberSchema = z.object({
  memberId: z.uuid(),
});

export const rejectMemberSchema = z.object({
  memberId: z.uuid(),
  /**
   * Shown verbatim to the applicant, so it is capped at a length an admin can
   * be expected to read back before sending.
   */
  reason: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" ? value.trim() : ""))
    .refine((value) => value.length <= 600, {
      message: "Keep the reason under 600 characters.",
    })
    .transform((value) => (value.length > 0 ? value : null)),
});

export const bulkDeleteMembersSchema = z.object({
  memberIds: z.array(z.uuid()).min(1, "Select at least one member."),
});

export const resendMemberInviteSchema = z.object({
  memberId: z.uuid(),
});

export type CreateMemberValues = z.infer<typeof createMemberSchema>;
export type ProvisionMemberWorkspaceAccountValues = z.infer<
  typeof provisionMemberWorkspaceAccountSchema
>;
export type UpdateMemberValues = z.infer<typeof updateMemberSchema>;
export type DeleteMemberValues = z.infer<typeof deleteMemberSchema>;
export type RejectMemberValues = z.infer<typeof rejectMemberSchema>;
export type BulkDeleteMembersValues = z.infer<typeof bulkDeleteMembersSchema>;
export type ResendMemberInviteValues = z.infer<typeof resendMemberInviteSchema>;

export const importMemberRowSchema = z.object({
  firstName: z.string().default(""),
  lastName: z.string().default(""),
  email: z.string().optional(),
  workspaceUserId: z.string().optional(),
  workspaceUserEmail: z.string().optional(),
  customFieldAnswers: z.record(z.string(), z.unknown()).default({}),
  groupIds: z.array(z.uuid()).default([]),
  role: z.enum(["member", "leader", "org_admin"]).default("member"),
  status: z
    .enum(["invited", "pending", "active", "suspended", "archived"])
    .default("active"),
});

export const importMembersSchema = z.object({
  rows: importMemberRowSchema.array().min(1).max(500),
});

export const searchWorkspaceUsersSchema = z.object({
  query: z.string().min(1).max(300),
});

export const batchLookupWorkspaceUsersSchema = z.object({
  emails: z.array(z.email()).min(1).max(500),
});

export const batchSuggestWorkspaceEmailsSchema = z.object({
  rows: z
    .array(z.object({ firstName: z.string(), lastName: z.string() }))
    .min(1)
    .max(500),
});

export const createWorkspaceAccountSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  primaryEmail: z.email(),
  /**
   * Personal inbox the welcome email (with the temporary password) goes to.
   * Never `primaryEmail` — that mailbox cannot be opened without the very
   * password the email carries. Omitted means "no reachable inbox", and the
   * welcome email is skipped rather than sent somewhere useless.
   */
  notifyEmail: z.email().optional(),
  sendWelcomeEmail: z.boolean().default(true),
  extraFields: z
    .record(z.string(), z.union([z.string(), z.boolean()]))
    .optional(),
});

export type ImportMemberRow = z.infer<typeof importMemberRowSchema>;
export type ImportMembersValues = z.infer<typeof importMembersSchema>;
