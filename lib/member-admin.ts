import { z } from "zod";

import { memberCustomFieldAnswersSchema } from "@/lib/member-custom-fields";

const tenantRoleSchema = z.enum(["member", "leader", "org_admin"]);
const membershipStatusSchema = z.enum(["invited", "pending", "active", "suspended", "archived"]);

const emailSchema = z.union([z.literal(""), z.email("Enter a valid email.")]).default("");

export const adminMemberIdentitySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: emailSchema,
  role: tenantRoleSchema.default("member"),
  status: membershipStatusSchema.default("active"),
  groupIds: z.array(z.string().uuid()).default([]),
});

export const createMemberSchema = adminMemberIdentitySchema;

export const updateMemberSchema = adminMemberIdentitySchema.extend({
  memberId: z.string().uuid(),
  customFieldAnswers: memberCustomFieldAnswersSchema.default({}),
});

export const deleteMemberSchema = z.object({
  memberId: z.string().uuid(),
});

export const bulkDeleteMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1, "Select at least one member."),
});

export const resendMemberInviteSchema = z.object({
  memberId: z.string().uuid(),
});

export type CreateMemberValues = z.infer<typeof createMemberSchema>;
export type UpdateMemberValues = z.infer<typeof updateMemberSchema>;
export type DeleteMemberValues = z.infer<typeof deleteMemberSchema>;
export type BulkDeleteMembersValues = z.infer<typeof bulkDeleteMembersSchema>;
export type ResendMemberInviteValues = z.infer<typeof resendMemberInviteSchema>;
